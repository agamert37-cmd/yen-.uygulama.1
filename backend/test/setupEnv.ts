process.env.NODE_ENV = 'test';
process.env.PANEL_AUTH_TOKEN = process.env.PANEL_AUTH_TOKEN || 'test-panel-auth-token-1234';
process.env.DB_PATH = process.env.DB_PATH || ':memory:';
process.env.WORKSPACES_ROOT = process.env.WORKSPACES_ROOT || './.tmp-test-workspaces';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
