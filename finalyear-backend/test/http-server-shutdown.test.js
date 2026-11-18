
import assert from "node:assert/strict";
import { createServer, get } from "node:http";
import { test } from "node:test";

test("HTTP server waits for an active request before completing shutdown", async t => {
  let releaseResponse;
  let closePromise;
  let closeCompleted = false;

  const server = createServer((_request, response) => {
    response.writeHead(200, {
      "Content-Type": "text/plain"
    });

    response.write("request-started");

    new Promise(resolve => {
      releaseResponse = resolve;
    }).then(() => {
      response.end("request-finished");
    });
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);

    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  t.after(async () => {
    releaseResponse?.();

    if (closePromise) {
      await closePromise.catch(() => {});
    } else if (server.listening) {
      await new Promise(resolve => {
        server.close(resolve);
      });
    }
  });

  const address = server.address();

  const response = await new Promise((resolve, reject) => {
    const request = get(
      `http://127.0.0.1:${address.port}`,
      resolve
    );

    request.on("error", reject);
  });

  response.setEncoding("utf8");

  let responseBody = "";

  const responseCompleted = new Promise((resolve, reject) => {
    response.on("data", chunk => {
      responseBody += chunk;
    });

    response.on("end", resolve);
    response.on("error", reject);
  });

  // Initiate shutdown while the HTTP request is still active.
  closePromise = new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error);
        return;
      }

      closeCompleted = true;
      resolve();
    });
  });

  // Allow the server close operation to progress.
  await new Promise(resolve => setImmediate(resolve));

  // The active request must prevent shutdown completion.
  assert.equal(closeCompleted, false);

  // Allow the active request to finish.
  releaseResponse();

  await responseCompleted;
  await closePromise;

  assert.equal(
    responseBody,
    "request-startedrequest-finished"
  );

  assert.equal(closeCompleted, true);
});
