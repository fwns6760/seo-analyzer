import assert from "node:assert/strict";
import test from "node:test";
import { getPublicOrigin, getPublicUrl } from "../utils/request-url.ts";

function withNodeEnv(value, callback) {
  const previous = process.env.NODE_ENV;

  if (value === undefined) {
    delete process.env.NODE_ENV;
  } else {
    process.env.NODE_ENV = value;
  }

  try {
    callback();
  } finally {
    if (previous === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = previous;
    }
  }
}

test("request-url uses request origin during local development", () => {
  const request = new Request("http://localhost:3000/auth/login");

  withNodeEnv("development", () => {
    assert.equal(getPublicOrigin(request), "http://localhost:3000");
    assert.equal(getPublicUrl(request, "/login"), "http://localhost:3000/login");
  });
});

test("request-url prefers forwarded headers in production", () => {
  const request = new Request("http://0.0.0.0:8080/auth/login", {
    headers: {
      "x-forwarded-host": "seo-analyzer-web-n5hunzkyna-an.a.run.app",
      "x-forwarded-proto": "https",
    },
  });

  withNodeEnv("production", () => {
    assert.equal(getPublicOrigin(request), "https://seo-analyzer-web-n5hunzkyna-an.a.run.app");
    assert.equal(
      getPublicUrl(request, "/auth/callback?next=%2F"),
      "https://seo-analyzer-web-n5hunzkyna-an.a.run.app/auth/callback?next=%2F",
    );
  });
});

test("request-url falls back to request origin when forwarded host is missing", () => {
  const request = new Request("http://0.0.0.0:8080/auth/login", {
    headers: {
      "x-forwarded-proto": "https",
    },
  });

  withNodeEnv("production", () => {
    assert.equal(getPublicOrigin(request), "http://0.0.0.0:8080");
  });
});
