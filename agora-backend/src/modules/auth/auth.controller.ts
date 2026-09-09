import type { RequestHandler } from 'express';
import { getAuthUser } from '../../middlewares/authenticate.js';
import * as service from './auth.service.js';
import type { LoginInput, RefreshTokenInput, RegisterInput } from './auth.schema.js';

// `req.body` es `any` en los tipos de Express; la aserción es segura porque
// `validate` ya sustituyó el cuerpo por el resultado del esquema.
export const register: RequestHandler = async (req, res) => {
  const user = await service.register(req.body as RegisterInput);

  res.status(201).json({ user });
};

export const login: RequestHandler = async (req, res) => {
  const session = await service.login(req.body as LoginInput);

  res.json(session);
};

export const refresh: RequestHandler = async (req, res) => {
  const { refreshToken } = req.body as RefreshTokenInput;
  const tokens = await service.refresh(refreshToken);

  res.json(tokens);
};

export const logout: RequestHandler = async (req, res) => {
  const { refreshToken } = req.body as RefreshTokenInput;

  await service.logout(refreshToken);

  res.status(204).send();
};

export const profile: RequestHandler = async (req, res) => {
  const user = await service.getProfile(getAuthUser(req).id);

  res.json({ user });
};
