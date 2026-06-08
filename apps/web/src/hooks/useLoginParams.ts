import { useMemo } from "react";
import { runtimeConfig } from "../config.js";
import { loginParamsFromSearch, type LoginParams } from "../login-params.js";

/** Parse the current URL's login parameters once per mount. */
export const useLoginParams = (): LoginParams =>
  useMemo(() => loginParamsFromSearch(window.location.search, runtimeConfig), []);
