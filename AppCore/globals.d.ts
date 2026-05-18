/** Minimal `process` for Expo / RN where full Node typings are not assumed. */
declare const process: {
  env: Record<string, string | undefined>;
};
