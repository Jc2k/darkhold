export default {
  extends: ['@commitlint/config-conventional'],
  ignores: [(message) => message.startsWith('Initial plan')],
};
