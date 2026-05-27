module.exports = {
  apps: [
    {
      name: 'school-backend',
      cwd: '/opt/school-backend',
      script: 'dist/src/main.js',
      instances: 1,
      exec_mode: 'fork',
      env_file: '.env.production',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      max_memory_restart: '512M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: '/var/log/school-backend/error.log',
      out_file: '/var/log/school-backend/out.log',
      merge_logs: true,
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000,
    },
  ],
};
