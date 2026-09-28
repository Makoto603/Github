import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { createProject, importInputData, loadProject, resume, review, run } from '../core.js';
import { Phase1ProductionBridge } from './phase1-production-bridge.js';
import { ProductionInputAdapter } from './production-input-adapter.js';
import { MapProductionService } from './production.js';

const json = async path => existsSync(path) ? JSON.parse(await readFile(path, 'utf8')) : null;
const inputTypes = new Set(['.png', '.jpg', '.jpeg', '.pdf']);
const referenceTypes = new Set(['.png', '.jpg', '.jpeg']);

export class MapProductionApplicationService {
  constructor({ projectsRoot = resolve('./projects'), openPath = async () => '', productionServiceFactory = null } = {}) {
    this.projectsRoot = projectsRoot;
    this.openPath = openPath;
    this.productionServiceFactory = productionServiceFactory || (path => new MapProductionService(path));
  }

  async createProject({ name, inputFiles = [], providerSettings = {} }) {
    await mkdir(this.projectsRoot, { recursive: true });
    const project = await createProject(this.projectsRoot, name, providerSettings);
    for (const source of inputFiles) await this.addInput(project.path, source);
    return this.getProjectState(project.path);
  }

  async addInput(projectPath, source) {
    const ext = extname(source).toLowerCase();
    if (!inputTypes.has(ext)) throw new Error('Unsupported input type');
    const target = join(projectPath, 'input', basename(source));
    await mkdir(join(projectPath, 'input'), { recursive: true });
    await cp(source, target);
    return importInputData(projectPath, basename(source), await readFile(target));
  }

  async getProjectState(projectPath) {
    const path = resolve(projectPath);
    const project = await json(join(path, 'project.json'));
    if (!project) throw new Error('Not a MAP project');
    const checkpoint = await json(join(path, 'production_checkpoint.json'));
    return {
      path,
      project,
      checkpoint,
      report: await json(join(path, 'map_production_report.json')),
      legacy: Boolean(checkpoint && !checkpoint.checkpoint_contract_version),
      stages: checkpoint?.stages || {},
      humanReview: await this.getHumanReview(path, project),
      productionSetup: await this.getProductionSetup(path),
      quality: await json(join(path, 'quality', 'quality_report.json')),
      mapQuality: await json(join(path, 'quality', 'map_quality_metrics.json')),
      unity: await json(join(path, 'unity', 'import_validation.json'))
        ?? await json(join(path, 'unity', 'material_import_validation.json'))
    };
  }

  async getHumanReview(projectPath, loadedProject = null) {
    const project = loadedProject ?? await loadProject(projectPath);
    const candidate = await json(join(projectPath, 'structure', 'candidate.json'));
    const analysis = await json(join(projectPath, 'analysis', 'drawing_analysis.json'));
    const step = project.steps?.human_review ?? {};
    const waiting = step.state === 'WAITING_USER' || (step.requires_human_decision === true && !['SUCCESS', 'APPROVED'].includes(step.state));
    const items = ['roads', 'buildings', 'objects'].flatMap(collection => (candidate?.[collection] ?? []).map(item => ({
      id: item.id,
      category: collection.slice(0, -1),
      source: item.source?.source_type ?? 'GENERATED',
      confidence: item.source?.confidence ?? null,
      reason: candidate?.metadata?.unresolved_items?.find(entry => entry.field?.includes(item.id))?.reason ?? null,
      value: collection === 'buildings' ? `height: ${item.height}` : collection === 'roads' ? `width: ${item.width}` : item.type
    })));
    return {
      waiting,
      requires_human_decision: waiting,
      step,
      candidate,
      analysis,
      items,
      warnings: candidate?.metadata?.unresolved_items ?? []
    };
  }

  async getProductionSetup(projectPath) {
    const bridge = new Phase1ProductionBridge(projectPath);
    const root = join(projectPath, 'production_bridge');
    const draft = await json(join(root, 'binding_draft.json'));
    const reviewData = await json(join(root, 'binding_review.json'));
    const readiness = await json(join(root, 'production_readiness.json')) ?? await bridge.analyzeReadiness();
    return {
      waiting: readiness?.state === 'WAITING_USER',
      draft,
      review: reviewData,
      readiness,
      reason: readiness?.reason || null
    };
  }

  async getProductionReadiness(projectPath) {
    return (await this.getProductionSetup(projectPath)).readiness;
  }

  async resumeProduction(projectPath) {
    const result = await resume(projectPath);
    return { result, state: await this.getProjectState(projectPath) };
  }

  async startProduction(projectPath) {
    const result = await run(projectPath, 'preflight');
    return { result, state: await this.getProjectState(projectPath) };
  }

  async approveHumanReview(projectPath, reviewData = {}) {
    const action = reviewData.action === 'continue_unresolved' ? 'continue_unresolved' : 'approve';
    await review(projectPath, action, reviewData.unresolved_item ?? {});
    await new Phase1ProductionBridge(projectPath).createBindingDraft();
    const result = { final_state: 'WAITING_USER', reason: 'PRODUCTION_BINDING_REVIEW' };
    return { result, state: await this.getProjectState(projectPath) };
  }

  async approveProductionSetup(projectPath, decisions = []) {
    const bridge = new Phase1ProductionBridge(projectPath);
    let result;
    try {
      await bridge.approveBindings(decisions);
      result = await bridge.buildProductionInputs();
    } catch (error) {
      result = await bridge.persistFailure(error);
    }
    return { result, state: await this.getProjectState(projectPath) };
  }

  async startFullProduction(projectPath) {
    const root = resolve(projectPath), bridge = join(root, 'production_bridge');
    const readiness = await json(join(bridge, 'production_readiness.json'));
    if (readiness?.state !== 'READY') throw new Error(`Production readiness is not READY: ${readiness?.state || 'MISSING'}`);
    const [mapStructure, bindingReview, assetFile, referenceFile] = await Promise.all([
      json(join(root, 'structure', 'map_structure.json')), json(join(bridge, 'binding_review.json')),
      json(join(bridge, 'asset_requirements.json')), json(join(bridge, 'reference_requirements.json'))
    ]);
    if (!mapStructure || !bindingReview || !assetFile || !referenceFile) throw new Error('Production bridge artifacts are incomplete');
    const input = new ProductionInputAdapter().build({ mapStructure, bindingReview, assetRequirements: assetFile.asset_requirements || [], referenceRequirements: referenceFile.reference_requirements || [], projectConfig: (await loadProject(root)).provider_settings });
    const service = this.productionServiceFactory(root, input);
    const result = await service.run({ map: input.map_structure, productionInput: input, referenceRequirements: input.reference_requirements });
    return { result, input, state: await this.getProjectState(root) };
  }

  async addUserReference(projectPath, source) {
    const ext = extname(source).toLowerCase();
    if (!referenceTypes.has(ext) || !existsSync(source)) throw new Error('Reference image must be an existing PNG/JPG/JPEG file');
    const root = join(projectPath, 'production_bridge', 'user_references');
    await mkdir(root, { recursive: true });
    const target = join(root, basename(source));
    await cp(source, target);
    return { path: target, name: basename(target), type: ext.slice(1).toUpperCase(), size: (await stat(target)).size };
  }

  async openArtifact(path) { return this.openPath(path); }

  async listInputs(projectPath) {
    const input = join(projectPath, 'input');
    if (!existsSync(input)) return [];
    const { readdir } = await import('node:fs/promises');
    const names = await readdir(input);
    return Promise.all(names.map(async name => {
      const path = join(input, name);
      const size = (await stat(path)).size;
      return { name, path, size, type: name.split('.').pop().toUpperCase() };
    }));
  }
}