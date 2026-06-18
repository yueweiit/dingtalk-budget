module.exports = {
  apps: [{
    name: 'dingtalk-budget',
    script: 'index.js',
    cwd: '/opt/dingtalk-budget/server',
    env_file: '/opt/dingtalk-budget/server/.env',
    watch: false,
    autorestart: true,
  }],
};
