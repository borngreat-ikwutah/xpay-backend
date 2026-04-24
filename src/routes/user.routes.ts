import { Hono } from 'hono';
import { UserController } from '../controllers/user.controller';
import { Bindings } from '../types';

const userRoutes = new Hono<{ Bindings: Bindings }>();

userRoutes.get('/', UserController.getUsers);
userRoutes.post('/', UserController.createUser);

export { userRoutes };
