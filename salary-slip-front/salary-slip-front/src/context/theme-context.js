import { createContext, useContext } from "react";

/**
 * The theme context and its hook, kept out of ThemeContext.jsx so that file
 * exports nothing but the provider component. Fast refresh can only preserve
 * state for a module whose exports are all components; mixing the hook in with
 * the provider meant every edit to either one remounted the whole tree and
 * dropped whatever the user had typed.
 */
export const ThemeContext = createContext(null);

export const useTheme = () => useContext(ThemeContext);
