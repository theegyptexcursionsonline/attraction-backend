import { NextFunction, Response } from 'express';
import { AuthRequest } from '../types';
import { sendError, sendSuccess } from '../utils/response';
import { GatewayLifecycleConflict, activateGatewayDomain } from '../services/gatewayLifecycleActivation.service';
import { stageGatewayDomain } from '../services/gatewayLifecycleStage.service';
import { rollbackGatewayDomain } from '../services/gatewayLifecycleRollback.service';
import { detachGatewayDomain } from '../services/gatewayLifecycleDetach.service';
import { getGatewayLifecycleOperation, getGatewayLifecycleStatus } from '../services/gatewayLifecycleStatus.service';

/** Super-admin is enforced both here and in the router. */
export async function applyGatewayLifecycle(req:AuthRequest,res:Response,next:NextFunction):Promise<void> {
  res.setHeader('Cache-Control','private, no-store');
  if(!req.user || req.user.role!=='super-admin') {sendError(res,'Super admin access required',req.user?403:401);return;}
  if(req.params.id!==req.body.proof.tenantId) {sendError(res,'Observation unavailable',409);return;}
  try {
    const result=req.body.proof.action==='stage'
      ? await stageGatewayDomain(req.body.proof,req.body.signature,req.body.receipt)
      : req.body.proof.action==='rollback'
        ? await rollbackGatewayDomain(req.body.proof,req.body.signature)
        : req.body.proof.action==='detach'
          ? await detachGatewayDomain(req.body.proof,req.body.signature)
          : await activateGatewayDomain(req.body.proof,req.body.signature);
    sendSuccess(res,result);
  } catch(error) {
    if(error instanceof GatewayLifecycleConflict) {sendError(res,error.message,409);return;}
    next(error);
  }
}

export async function readGatewayLifecycleStatus(req:AuthRequest,res:Response,next:NextFunction):Promise<void> {
  res.setHeader('Cache-Control','private, no-store');
  if(!req.user || req.user.role!=='super-admin') {sendError(res,'Super admin access required',req.user?403:401);return;}
  try {
    const result=await getGatewayLifecycleStatus(req.params.domain,req.params.id,req.params.generation);
    if(!result) {sendError(res,'Lifecycle record not found',404);return;}
    sendSuccess(res,result);
  } catch(error) {
    if(error instanceof GatewayLifecycleConflict) {sendError(res,error.message,503);return;}
    next(error);
  }
}

export async function readGatewayLifecycleOperation(req:AuthRequest,res:Response,next:NextFunction):Promise<void> {
  res.setHeader('Cache-Control','private, no-store');
  if(!req.user || req.user.role!=='super-admin') {sendError(res,'Super admin access required',req.user?403:401);return;}
  try {
    const result=await getGatewayLifecycleOperation(req.params.domain,req.params.id,req.params.operationId);
    if(!result) {sendError(res,'Lifecycle record not found',404);return;}
    sendSuccess(res,result);
  } catch(error) {
    if(error instanceof GatewayLifecycleConflict) {sendError(res,error.message,503);return;}
    next(error);
  }
}
