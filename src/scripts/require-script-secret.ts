export const requireScriptSecret = (name: string, minLength = 12): string => {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be supplied through the approved secret manager`);
  }

  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }

  return value;
};
