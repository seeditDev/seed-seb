export const initialize = () => {};
export const render = () => Promise.resolve({ svg: '' });
export const run = () => Promise.resolve();

const mermaid = {
  initialize,
  render,
  run,
};
export default mermaid;
