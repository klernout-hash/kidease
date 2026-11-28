/** Stand-in for the server-function wrapper. The handler body is the product code. */
export function createServerFn() {
  const api = {
    middleware() {
      return api;
    },
    validator(fn) {
      api.validate = fn;
      return api;
    },
    handler(fn) {
      const validate = api.validate;
      return async (call) =>
        fn({
          context: call.context,
          data: validate ? validate(call.data) : call.data,
        });
    },
  };
  return api;
}

export function createMiddleware() {
  const api = {
    client() {
      return api;
    },
    server() {
      return api;
    },
  };
  return api;
}

export function createServerOnlyFn(fn) {
  return fn;
}

export function createStart() {
  return {};
}
