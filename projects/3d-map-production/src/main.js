import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MapProductionApplicationService } from '../assets/map-production-application-service.js';
import { configureNetworkRuntime } from './network-runtime.js';

let window;
configureNetworkRuntime();
const service = new MapProductionApplicationService({ openPath: path => shell.openPath(path) });
const desktopDir = dirname(fileURLToPath(import.meta.url));
const preloadPath = join(desktopDir, 'preload.cjs');
const send = (type, payload) => window?.webContents.send('map-studio:event', { type, payload, timestamp: new Date().toISOString() });

console.log('[MAP Studio] preload path:', preloadPath);
console.log('[MAP Studio] Preload Exists:', existsSync(preloadPath));
app.on('web-contents-created', (_, contents) => contents.on('preload-error', (_, path, error) => console.error('[MAP Studio] preload error:', path, error)));

app.whenReady().then(() => {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1100,
    minHeight: 700,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });
  window.webContents.on('console-message', event => console.log(`[MAP Studio] renderer console (${event.level}):`, event.message));
  window.webContents.once('did-finish-load', async () => {
    try {
      const smoke = await window.webContents.executeJavaScript('({ available: typeof window.mapStudio === "object", ping: window.mapStudio?.ping?.() })');
      console.log('[MAP Studio] preload smoke:', smoke);
      const controls = await window.webContents.executeJavaScript(`(() => {
        const navigation = document.querySelector('[data-page="input"]');
        navigation.click();
        document.getElementById('new').click();
        const projectDialog = document.querySelector('dialog');
        const newProjectClick = Boolean(projectDialog?.open);
        projectDialog?.close();
        return {
          navigationClick: navigation.classList.contains('active'),
          newProjectClick,
          openProjectHandler: typeof document.getElementById('open').onclick === 'function',
          resumeHandler: typeof document.getElementById('resume').onclick === 'function'
        };
      })()`);
      console.log('[MAP Studio] control smoke:', controls);
    } catch (error) {
      console.error('[MAP Studio] preload smoke failed:', error);
    }
  });
  window.loadFile(join(desktopDir, 'index.html'));

  ipcMain.handle('project:create', async (_, data) => {
    send('stage-status', { stage: 'PROJECT', status: 'RUNNING' });
    const result = await service.createProject(data);
    send('stage-status', { stage: 'PROJECT', status: 'READY' });
    return result;
  });
  ipcMain.handle('project:open', async () => {
    const result = await dialog.showOpenDialog(window, { properties: ['openDirectory'] });
    return result.canceled ? null : service.getProjectState(result.filePaths[0]);
  });
  ipcMain.handle('project:state', (_, path) => service.getProjectState(path));
  ipcMain.handle('project:inputs', (_, path) => service.listInputs(path));
  ipcMain.handle('production:start', async (_, path) => {
    send('stage-status', { stage: 'ANALYZING', status: 'RUNNING' });
    const result = await service.startProduction(path);
    send('stage-status', { stage: 'ANALYZING', status: result.result?.state || 'READY' });
    return result;
  });
  ipcMain.removeHandler('production:start-full');
  ipcMain.handle('production:start-full', async (_, path) => service.startFullProduction(path));
  ipcMain.handle('project:resume', async (_, path) => {
    send('stage-status', { stage: 'RESUME', status: 'RUNNING' });
    const result = await service.resumeProduction(path);
    send('stage-status', { stage: 'RESUME', status: result.result?.state || 'READY' });
    return result;
  });
  ipcMain.handle('human-review:approve', async (_, path, reviewData) => {
    send('stage-status', { stage: 'HUMAN_REVIEW', status: 'RUNNING' });
    const result = await service.approveHumanReview(path, reviewData);
    send('stage-status', { stage: 'HUMAN_REVIEW', status: result.state.project.steps.human_review.state });
    send('stage-status', { stage: 'PRODUCTION_SETUP', status: 'WAITING_USER' });
    return result;
  });
  ipcMain.handle('production-setup:get', (_, path) => service.getProductionSetup(path));
  ipcMain.handle('production-setup:readiness', (_, path) => service.getProductionReadiness(path));
  ipcMain.handle('production-setup:approve', async (_, path, decisions) => {
    send('stage-status', { stage: 'PRODUCTION_SETUP', status: 'RUNNING' });
    const result = await service.approveProductionSetup(path, decisions);
    send('stage-status', { stage: 'PRODUCTION_SETUP', status: result.result?.state || 'FAILED' });
    return result;
  });
  ipcMain.handle('dialog:reference-image', async (_, projectPath) => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile'],
      filters: [{ name: 'Reference images', extensions: ['png', 'jpg', 'jpeg'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return service.addUserReference(projectPath, result.filePaths[0]);
  });
  ipcMain.handle('dialog:inputs', async () => {
    const result = await dialog.showOpenDialog(window, {
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'MAP inputs', extensions: ['png', 'jpg', 'jpeg', 'pdf'] }]
    });
    return result.canceled ? [] : result.filePaths;
  });
  ipcMain.handle('artifact:open', (_, path) => service.openArtifact(path));
});