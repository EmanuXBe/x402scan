import { createChainSyncTask } from '../../../sync';
import { stellarSorobanConfig } from './config';

export const stellarSyncTransfers = createChainSyncTask(stellarSorobanConfig);
