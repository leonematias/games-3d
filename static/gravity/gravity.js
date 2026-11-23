import { SimulatorController } from './controller.js';

const controller = new SimulatorController(document.getElementById('view'));
const api = controller.api();
Object.defineProperty(api, 'ready', { get: () => controller.ready });
Object.defineProperty(api, 'frames', { get: () => controller.frames });
window.__gravity = api;
controller.start();
