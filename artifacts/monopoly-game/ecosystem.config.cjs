module.exports = {
  apps: [
    {
      name: "monopoly-game",
      script: "server/server.js",
      cwd: ".",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        GAME_PORT: 8001,
      },
    },
  ],
};
