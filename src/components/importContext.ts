/* Lets the WordList toolbar (and the #share= URL handler in App) open the
 * single top-level ImportShareModal without prop-drilling. */
import React from "react";

export const ImportContext = React.createContext<{ openImport: (token?: string | null) => void }>({ openImport: () => {} });
export const useImport = () => React.useContext(ImportContext);
