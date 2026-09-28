import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const read = async path => JSON.parse(await readFile(path, 'utf8'));
const save = (path, value) => writeFile(path, JSON.stringify(value, null, 2));
const positiveDimensions = values => Array.isArray(values) && values.length === 3 && values.every(value => Number.isFinite(value) && value > 0);
const GENERATED_MODES = new Set(['generated_asset', 'GENERATED_ASSET']);
const normalizeMode = value => ({ PROCEDURAL: 'procedural', GENERATED_ASSET: 'generated_asset', EXISTING_ASSET: 'existing_asset', IGNORE: 'ignore' }[value] || value || 'procedural');
const normalizePolicy = value => String(value || 'NONE').toUpperCase();

const dimensionsFor = (item, kind) => {
  if (kind === 'building') {
    const xs = (item.footprint || []).map(point => point[0]);
    const ys = (item.footprint || []).map(point => point[1]);
    if (!xs.length || !ys.length) return item.scale || [1, 1, Math.max(item.height || 1, 1)];
    return [Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), item.height];
  }
  if (kind === 'road') {
    const points = item.points || [];
    if (points.length < 2) return [1, item.width || 1, .1];
    const a = points[0], b = points.at(-1);
    return [Math.max(Math.hypot((b[0] || 0) - (a[0] || 0), (b[1] || 0) - (a[1] || 0), (b[2] || 0) - (a[2] || 0)), .001), Math.max(item.width || 1, .001), .1];
  }
  return item.dimensions || item.scale || [1, 1, 1];
};

const assetIdFor = entry => `asset_${entry.semantic_type}_${createHash('sha256').update(entry.object_id).digest('hex').slice(0, 10)}`;
const refIdFor = assetId => `refreq_${createHash('sha256').update(assetId).digest('hex').slice(0, 12)}`;

export class Phase1ProductionBridge {
  constructor(projectPath) {
    this.projectPath = projectPath;
    this.root = join(projectPath, 'production_bridge');
  }

  async map() { return read(join(this.projectPath, 'structure', 'map_structure.json')); }

  async createBindingDraft() {
    const map = await this.map();
    const entries = [
      ...(map.objects || []).map(item => ({ item, semantic_type: item.type })),
      ...(map.roads || []).map(item => ({ item, semantic_type: 'road' })),
      ...(map.buildings || []).map(item => ({ item, semantic_type: 'building' }))
    ].map(({ item, semantic_type }) => {
      const generated = ['building', 'prop', 'landmark', 'machine', 'placeholder', 'primitive'].includes(semantic_type);
      const mode = semantic_type === 'zone' ? 'ignore' : generated ? 'generated_asset' : 'procedural';
      const inferred = item.source?.source_type === 'INFERRED';
      return {
        object_id: item.id,
        name: item.name || item.id,
        semantic_type,
        suggested_mode: mode,
        production_mode: mode,
        reference_policy: generated ? 'AUTO_ACQUIRE' : 'NONE',
        reason: generated ? 'Detailed visual geometry is a production candidate.' : 'Deterministic Phase 1 geometry is retained.',
        target_dimensions: dimensionsFor(item, semantic_type),
        requires_reference: generated,
        confidence: inferred ? .72 : .95,
        source_type: item.source?.source_type || 'GENERATED',
        status: generated && inferred ? 'NEEDS_REVIEW' : 'AUTO_APPROVED'
      };
    });
    await mkdir(this.root, { recursive: true });
    const draft = { map_id: map.project?.id, created_at: new Date().toISOString(), entries };
    await save(join(this.root, 'binding_draft.json'), draft);
    return draft;
  }

  async analyzeReadiness() {
    if (!existsSync(join(this.projectPath, 'structure', 'map_structure.json'))) return { state: 'PENDING', reason: 'MAP_STRUCTURE_NOT_READY', unresolved_object_ids: [] };
    if (existsSync(join(this.root, 'production_readiness.json'))) return read(join(this.root, 'production_readiness.json'));
    const draft = existsSync(join(this.root, 'binding_draft.json')) ? await read(join(this.root, 'binding_draft.json')) : await this.createBindingDraft();
    return {
      state: 'WAITING_USER',
      reason: 'PRODUCTION_BINDING_REVIEW',
      unresolved_object_ids: draft.entries.map(entry => entry.object_id),
      draft
    };
  }

  async approveBindings(decisions = []) {
    const map = await this.map();
    const draft = existsSync(join(this.root, 'binding_draft.json')) ? await read(join(this.root, 'binding_draft.json')) : await this.createBindingDraft();
    const draftIds = new Set(draft.entries.map(entry => entry.object_id));
    const unknown = decisions.find(decision => !draftIds.has(decision.object_id));
    if (unknown) throw new Error(`Unknown production setup object: ${unknown.object_id}`);

    const byId = new Map(decisions.map(decision => [decision.object_id, decision]));
    const entries = draft.entries.map(entry => {
      const decision = byId.get(entry.object_id) || {};
      const production_mode = normalizeMode(decision.production_mode || decision.mode || decision.suggested_mode || entry.production_mode || entry.suggested_mode);
      const reference_policy = normalizePolicy(decision.reference_policy || entry.reference_policy || (GENERATED_MODES.has(production_mode) ? 'AUTO_ACQUIRE' : 'NONE'));
      return {
        ...entry,
        ...decision,
        production_mode,
        suggested_mode: production_mode,
        reference_policy,
        selected_reference: decision.selected_reference || decision.reference_image || entry.selected_reference || entry.reference_image || null,
        status: 'APPROVED'
      };
    });

    const allIds = new Set([
      ...(map.objects || []).map(item => item.id),
      ...(map.roads || []).map(item => item.id),
      ...(map.buildings || []).map(item => item.id)
    ]);
    const assetIds = new Set();
    const assets = [];
    const references = [];
    const issues = [];

    for (const entry of entries) {
      if (!allIds.has(entry.object_id)) throw new Error(`Production setup references a missing semantic object: ${entry.object_id}`);
      if (!GENERATED_MODES.has(entry.production_mode)) {
        if (entry.production_mode === 'existing_asset') issues.push({ object_id: entry.object_id, code: 'EXISTING_ASSET_NOT_CONFIGURED', message: 'Existing asset selection is not configured yet.' });
        continue;
      }

      if (!positiveDimensions(entry.target_dimensions)) throw new Error(`Invalid target dimensions: ${entry.object_id}`);
      const asset_id = entry.asset_id || assetIdFor(entry);
      if (assetIds.has(asset_id)) throw new Error(`Duplicate asset ID: ${asset_id}`);
      assetIds.add(asset_id);

      const policy = normalizePolicy(entry.reference_policy);
      const selected = entry.selected_reference || null;
      let reference_requirement_id = null;
      let reference_image = null;
      if (policy === 'AUTO_ACQUIRE') {
        reference_requirement_id = refIdFor(asset_id);
        references.push({
          reference_requirement_id,
          asset_id,
          object_ids: [entry.object_id],
          mode: 'AUTO_ACQUIRE',
          category: entry.semantic_type,
          purpose: 'GEOMETRY',
          search_terms: [entry.name, entry.semantic_type].filter(Boolean),
          desired_views: [],
          minimum_resolution: null,
          preferred_aspect: null,
          reference_count: 1,
          required: true,
          status: 'PENDING'
        });
      } else if (policy === 'USER_PROVIDED') {
        reference_requirement_id = refIdFor(asset_id);
        if (selected && existsSync(selected)) {
          reference_image = selected;
          references.push({
            reference_requirement_id,
            asset_id,
            object_ids: [entry.object_id],
            mode: 'USER_PROVIDED',
            category: entry.semantic_type,
            purpose: 'GEOMETRY',
            required: true,
            local_path: selected,
            status: 'RESOLVED'
          });
        } else {
          references.push({
            reference_requirement_id,
            asset_id,
            object_ids: [entry.object_id],
            mode: 'USER_PROVIDED',
            category: entry.semantic_type,
            purpose: 'GEOMETRY',
            required: true,
            local_path: selected,
            status: 'WAITING_USER'
          });
          issues.push({ object_id: entry.object_id, code: 'USER_REFERENCE_REQUIRED', message: 'USER_PROVIDED requires a selected image.' });
        }
      } else if (policy === 'NONE') {
        issues.push({ object_id: entry.object_id, code: 'REFERENCE_REQUIRED_BY_PROVIDER', message: 'The current Hunyuan3D provider requires a reference image.' });
      } else {
        issues.push({ object_id: entry.object_id, code: 'REFERENCE_POLICY_UNRESOLVED', message: `Unknown reference policy: ${policy}` });
      }

      assets.push({
        asset_id,
        category: entry.semantic_type,
        object_ids: [entry.object_id],
        generation_mode: 'generated_asset',
        reference_image,
        reference_set: [],
        reference_requirement_id,
        generation_profile: entry.generation_profile || {},
        provider_preferences: Array.isArray(entry.provider_preferences) && entry.provider_preferences.length ? entry.provider_preferences : ['Hunyuan3DProvider'],
        performance_profile: entry.performance_profile || 'Prototype',
        target_dimensions: entry.target_dimensions,
        replacement_policy: 'replace_ready',
        review_status: 'APPROVED',
        provenance: {
          source_stage: 'phase1_production_bridge',
          review_id: 'production-setup',
          reviewed_by: 'human-review',
          source_object_ids: [entry.object_id],
          source_types: [entry.source_type || 'GENERATED'],
          created_at: new Date().toISOString()
        }
      });
    }

    await mkdir(this.root, { recursive: true });
    await save(join(this.root, 'binding_review.json'), { decisions: entries, issues, approved_at: new Date().toISOString() });
    await save(join(this.root, 'asset_requirements.json'), { asset_requirements: assets });
    await save(join(this.root, 'reference_requirements.json'), { reference_requirements: references });
    return { entries, asset_requirements: assets, reference_requirements: references, issues };
  }

  async buildProductionInputs() {
    const map = await this.map();
    const review = await read(join(this.root, 'binding_review.json'));
    const assets = await read(join(this.root, 'asset_requirements.json'));
    const references = await read(join(this.root, 'reference_requirements.json'));
    const allIds = new Set([
      ...(map.objects || []).map(item => item.id),
      ...(map.roads || []).map(item => item.id),
      ...(map.buildings || []).map(item => item.id)
    ]);
    const errors = [];
    const unresolved = [...(review.issues || [])];
    const ids = new Set();

    for (const asset of assets.asset_requirements || []) {
      if (!asset.asset_id) errors.push('Generated asset is missing asset_id');
      else if (ids.has(asset.asset_id)) errors.push(`Duplicate asset ID: ${asset.asset_id}`);
      else ids.add(asset.asset_id);
      if (!Array.isArray(asset.object_ids) || !asset.object_ids.length || asset.object_ids.some(id => !allIds.has(id))) errors.push(`Invalid object_ids for ${asset.asset_id || 'unknown asset'}`);
      if (!positiveDimensions(asset.target_dimensions)) errors.push(`Invalid target dimensions: ${asset.asset_id || 'unknown asset'}`);
      if (!asset.performance_profile) errors.push(`Missing performance profile: ${asset.asset_id || 'unknown asset'}`);
    }

    for (const reference of references.reference_requirements || []) {
      if (reference.mode === 'AUTO_ACQUIRE' && reference.status === 'PENDING') continue;
      if (reference.mode === 'USER_PROVIDED' && reference.status === 'RESOLVED' && reference.local_path && existsSync(reference.local_path)) continue;
      if (reference.required && reference.status !== 'RESOLVED') unresolved.push({ object_id: reference.object_ids?.[0] || null, code: 'REFERENCE_UNRESOLVED', message: `Reference is unresolved for ${reference.asset_id}` });
    }

    const state = errors.length ? 'FAILED' : unresolved.length ? 'WAITING_USER' : 'READY';
    const readiness = {
      state,
      reason: state === 'READY' ? 'PRODUCTION_SETUP_COMPLETE' : state === 'WAITING_USER' ? 'PRODUCTION_BINDING_REVIEW' : 'PRODUCTION_SETUP_INVALID',
      errors,
      unresolved_items: unresolved,
      asset_requirements: assets.asset_requirements || [],
      reference_requirements: references.reference_requirements || [],
      summary: {
        generated_assets: (assets.asset_requirements || []).length,
        procedural_objects: (review.decisions || []).filter(entry => entry.production_mode === 'procedural').length,
        references_to_acquire: (references.reference_requirements || []).filter(reference => reference.mode === 'AUTO_ACQUIRE' && reference.status === 'PENDING').length
      },
      created_at: new Date().toISOString()
    };
    await save(join(this.root, 'production_readiness.json'), readiness);
    return readiness;
  }

  async persistFailure(error) {
    await mkdir(this.root, { recursive: true });
    const readiness = { state: 'FAILED', reason: 'PRODUCTION_SETUP_INVALID', errors: [error?.message || String(error)], unresolved_items: [], created_at: new Date().toISOString() };
    await save(join(this.root, 'production_readiness.json'), readiness);
    return readiness;
  }
}