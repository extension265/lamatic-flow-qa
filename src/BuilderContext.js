import { createContext } from 'react';

export const BuilderContext = createContext({
  runState: {},
  validationErrors: [],
  openConfig: () => {},
  deleteNode: () => {},
  openPicker: () => {},
});
