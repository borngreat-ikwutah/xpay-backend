import { Hono } from 'hono';
import { AgencyController } from '../controllers/agency.controller';
import { Bindings } from '../types';

const agencyRoutes = new Hono<{ Bindings: Bindings }>();

agencyRoutes.post('/trigger', AgencyController.triggerExecution);

export { agencyRoutes };
