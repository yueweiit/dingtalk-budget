export const dingtalkConfig = {
  appKey: process.env.DINGTALK_APP_KEY || 'dingumkeaffrev8eyd5j',
  appSecret: process.env.DINGTALK_APP_SECRET || 'mHcyqOP9s98l-buIBWnSHUNxHqC4XuAq6AlEZX8GyoNZL8TQqotOjubzJ152Oi5r',
  processCode: process.env.DINGTALK_PROCESS_CODE || 'PROC-45C2862D-07D1-48AE-A595-4A9EE54FBF8C',

  oapiUrl: process.env.DINGTALK_OAPI_URL || 'https://oapi.dingtalk.com',
  apiUrl: process.env.DINGTALK_API_URL || 'https://api.dingtalk.com',

  getTokenUrl: '/gettoken',
  processInstanceIdsUrl: '/v1.0/workflow/processes/instanceIds/query',
  processInstanceGetUrl: '/v1.0/workflow/processInstances',
  oldProcessInstanceIdsUrl: '/topapi/processinstance/listids',
  oldProcessInstanceGetUrl: '/topapi/processinstance/get',
};
