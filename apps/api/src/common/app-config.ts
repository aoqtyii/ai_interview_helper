type AppConfig = {
  nodeEnv: string;
  jwtSecret: string;
  aiMockMode: boolean;
};

export function loadAppConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  const jwtSecret = env.JWT_SECRET?.trim();

  if (isProduction && !jwtSecret) {
    throw new Error('JWT_SECRET is required in production');
  }

  return {
    nodeEnv,
    jwtSecret: jwtSecret || 'dev-only-change-me',
    aiMockMode: parseBoolean(env.AI_MOCK_MODE) || (!isProduction && !env.AI_API_KEY)
  };
}

function parseBoolean(value?: string) {
  return value === 'true' || value === '1' || value === 'yes';
}
