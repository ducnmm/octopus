export type OctopusFetch = typeof fetch;

export type RequestJsonOptions = RequestInit & {
  fetch: OctopusFetch;
};

export const requestJson = async <T>(url: string, init: RequestJsonOptions): Promise<T> => {
  const { fetch: fetchImpl, ...requestInit } = init;
  const response = await fetchImpl(url, {
    ...requestInit,
    headers: {
      "content-type": "application/json",
      ...(requestInit.headers ?? {})
    }
  });

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

  if (!response.ok) {
    const error = typeof data.error === "string" ? data.error : `Request failed with ${response.status}`;
    throw new Error(error);
  }

  return data as T;
};
