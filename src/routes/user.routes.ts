import { Hono } from 'hono';
import { UserController } from '../controllers/user.controller';
import { Bindings } from '../types';

const userRoutes = new Hono<{ Bindings: Bindings }>();

userRoutes.get('/', UserController.getUsers);
userRoutes.post('/', UserController.createUser);
userRoutes.get('/nonce', UserController.getNonce);
userRoutes.post('/verify', UserController.verifySignature);

export { userRoutes };
