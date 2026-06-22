import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

export const dingtalkConfig = {
  appKey: process.env.DINGTALK_APP_KEY,
  appSecret: process.env.DINGTALK_APP_SECRET,
  processCode: process.env.DINGTALK_PROCESS_CODE,

  oapiUrl: process.env.DINGTALK_OAPI_URL || 'https://oapi.dingtalk.com',
  apiUrl: process.env.DINGTALK_API_URL || 'https://api.dingtalk.com',

  getTokenUrl: '/gettoken',
  processInstanceIdsUrl: '/v1.0/workflow/processes/instanceIds/query',
  processInstanceGetUrl: '/v1.0/workflow/processInstances',
  oldProcessInstanceIdsUrl: '/topapi/processinstance/listids',
  oldProcessInstanceGetUrl: '/topapi/processinstance/get',
};
