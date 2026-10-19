const BaseRequest = globalThis.Request;
(globalThis as { Request: unknown }).Request = class extends BaseRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const { signal: _signal, ...rest } = init ?? {};
    super(input, rest);
  }
};
