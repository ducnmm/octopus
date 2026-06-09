// Wallet auth popup client script, extracted from the views layer.
export const authPopupScript = `
    <script>
      (() => {
        const walletsState = {
          initialized: false,
          cached: null,
          wallets: new Set(),
          listeners: { register: [], unregister: [] }
        };

        class OctopusWalletAppReadyEvent extends Event {
          constructor(api) {
            super("wallet-standard:app-ready", { bubbles: false, cancelable: false, composed: false });
            this.detail = api;
          }

          preventDefault() {
            throw new Error("preventDefault cannot be called");
          }

          stopImmediatePropagation() {
            throw new Error("stopImmediatePropagation cannot be called");
          }

          stopPropagation() {
            throw new Error("stopPropagation cannot be called");
          }
        }

        const emitWalletEvent = (eventName, wallets) => {
          for (const listener of walletsState.listeners[eventName] || []) {
            try {
              listener(...wallets);
            } catch (error) {
              console.error(error);
            }
          }
        };

        const registerWallets = (...wallets) => {
          const nextWallets = wallets.filter((wallet) => !walletsState.wallets.has(wallet));
          if (nextWallets.length === 0) {
            return () => {};
          }
          walletsState.cached = null;
          for (const wallet of nextWallets) {
            walletsState.wallets.add(wallet);
          }
          emitWalletEvent("register", nextWallets);
          return () => {
            walletsState.cached = null;
            for (const wallet of nextWallets) {
              walletsState.wallets.delete(wallet);
            }
            emitWalletEvent("unregister", nextWallets);
          };
        };

        const walletApi = () => {
          if (!walletsState.initialized) {
            walletsState.initialized = true;
            const api = Object.freeze({ register: registerWallets });
            window.addEventListener("wallet-standard:register-wallet", (event) => event.detail(api));
            window.dispatchEvent(new OctopusWalletAppReadyEvent(api));
          }

          return {
            get: () => {
              walletsState.cached ||= [...walletsState.wallets];
              return walletsState.cached;
            },
            on: (eventName, listener) => {
              walletsState.listeners[eventName]?.push(listener);
              return () => {
                walletsState.listeners[eventName] = walletsState.listeners[eventName]?.filter((item) => item !== listener) || [];
              };
            }
          };
        };

        const waitForWallets = async () => {
          const api = walletApi();
          if (api.get().length > 0) {
            return api.get();
          }
          await new Promise((resolve) => {
            const off = api.on("register", () => {
              off();
              resolve();
            });
            window.setTimeout(() => {
              off();
              resolve();
            }, 900);
          });
          return api.get();
        };

        const isSuiWallet = (wallet) => {
          const features = wallet?.features || {};
          return Boolean(
            features["standard:connect"]?.connect &&
            features["sui:signPersonalMessage"]?.signPersonalMessage &&
            wallet.chains?.some((chain) => String(chain).startsWith("sui:"))
          );
        };

        const accountCanSign = (account) => {
          return account?.features?.includes("sui:signPersonalMessage") && account.chains?.some((chain) => String(chain).startsWith("sui:"));
        };

        const walletScore = (wallet) => {
          const name = String(wallet.name || "").toLowerCase();
          return (name.includes("slush") ? 100 : 0) + ((wallet.accounts || []).length > 0 ? 10 : 0);
        };

        const pickAccount = (accounts, preferredAddress) => {
          const normalizedPreferred = preferredAddress ? preferredAddress.toLowerCase() : "";
          if (normalizedPreferred) {
            const preferred = accounts.find((account) => accountCanSign(account) && account.address.toLowerCase() === normalizedPreferred);
            if (preferred) {
              return preferred;
            }
          }
          return accounts.find(accountCanSign) || null;
        };

        const getSigner = async (preferredAddress) => {
          const wallets = (await waitForWallets()).filter(isSuiWallet).sort((left, right) => walletScore(right) - walletScore(left));
          if (wallets.length === 0) {
            throw new Error("No Sui wallet found.");
          }

          for (const wallet of wallets) {
            const existingAccount = pickAccount(wallet.accounts || [], preferredAddress);
            if (existingAccount) {
              return { wallet, account: existingAccount };
            }
          }

          const wallet = wallets[0];
          const result = await wallet.features["standard:connect"].connect();
          const accounts = [...(result.accounts || []), ...(wallet.accounts || [])];
          const account = pickAccount(accounts, preferredAddress);
          if (!account) {
            throw new Error("No Sui account was authorized.");
          }
          return { wallet, account };
        };

        const signMessage = async (signer, message) => {
          return await signer.wallet.features["sui:signPersonalMessage"].signPersonalMessage({
            message: new TextEncoder().encode(message),
            account: signer.account
          });
        };

        const accountCanExecute = (account, chain) => {
          return account?.features?.includes("sui:signAndExecuteTransaction") &&
            account.chains?.includes(chain);
        };

        const isAccessWallet = (wallet, chain) => {
          const features = wallet?.features || {};
          return Boolean(
            features["standard:connect"]?.connect &&
            features["sui:signAndExecuteTransaction"]?.signAndExecuteTransaction &&
            wallet.chains?.includes(chain)
          );
        };

        const pickAccessAccount = (accounts, preferredAddress, chain) => {
          const normalizedPreferred = preferredAddress ? preferredAddress.toLowerCase() : "";
          if (normalizedPreferred) {
            const preferred = accounts.find((account) => accountCanExecute(account, chain) && account.address.toLowerCase() === normalizedPreferred);
            if (preferred) {
              return preferred;
            }
          }
          return accounts.find((account) => accountCanExecute(account, chain)) || null;
        };

        const getAccessSigner = async (preferredAddress, chain) => {
          const wallets = (await waitForWallets())
            .filter((wallet) => isAccessWallet(wallet, chain))
            .sort((left, right) => walletScore(right) - walletScore(left));
          if (wallets.length === 0) {
            throw new Error("No Sui wallet found for " + chain + ".");
          }

          for (const wallet of wallets) {
            const existingAccount = pickAccessAccount(wallet.accounts || [], preferredAddress, chain);
            if (existingAccount) {
              return { wallet, account: existingAccount };
            }
          }

          const wallet = wallets[0];
          const result = await wallet.features["standard:connect"].connect();
          const accounts = [...(result.accounts || []), ...(wallet.accounts || [])];
          const account = pickAccessAccount(accounts, preferredAddress, chain);
          if (!account) {
            throw new Error("No Sui account was authorized for " + chain + ".");
          }
          return { wallet, account };
        };

        const fetchJson = async (path, options = {}) => {
          const response = await fetch(path, {
            credentials: "same-origin",
            ...options,
            headers: {
              ...(options.headers || {})
            }
          });
          const body = await response.json();
          if (!response.ok) {
            throw new Error(body.error || "HTTP " + response.status);
          }
          return body;
        };

        const currentReturnTo = () => {
          return window.location.pathname + window.location.search + window.location.hash;
        };

        const formValue = (formData, key) => {
          const value = formData.get(key);
          return typeof value === "string" ? value.trim() : "";
        };

        const setSubmitState = (button, working) => {
          if (!button) {
            return;
          }
          if (working) {
            button.dataset.originalText ||= button.textContent || "";
            button.disabled = true;
            button.setAttribute("aria-busy", "true");
            button.textContent = "Updating";
            return;
          }
          button.disabled = false;
          button.removeAttribute("aria-busy");
          if (button.dataset.originalText) {
            button.textContent = button.dataset.originalText;
          }
        };

        const copyText = async (text) => {
          if (navigator.clipboard?.writeText && window.isSecureContext) {
            await navigator.clipboard.writeText(text);
            return;
          }

          const input = document.createElement("textarea");
          input.value = text;
          input.setAttribute("readonly", "");
          input.style.position = "fixed";
          input.style.opacity = "0";
          document.body.appendChild(input);
          input.select();
          document.execCommand("copy");
          input.remove();
        };

        document.addEventListener("click", (event) => {
          const trigger = event.target.closest("[data-copy-text]");
          if (!trigger) {
            return;
          }
          event.preventDefault();
          const text = trigger.getAttribute("data-copy-text") || "";
          copyText(text).then(() => {
            trigger.classList.add("is-copied");
            trigger.setAttribute("title", "Copied");
            trigger.setAttribute("aria-label", "Copied");
            window.setTimeout(() => {
              trigger.classList.remove("is-copied");
              trigger.setAttribute("title", "Copy clone command");
              trigger.setAttribute("aria-label", "Copy clone command");
            }, 1400);
          }).catch((error) => {
            console.error(error);
          });
        });

        document.addEventListener("submit", (event) => {
          const form = event.target.closest("form[data-octopus-access-form]");
          if (!form) {
            return;
          }
          event.preventDefault();

          const button = form.querySelector("button[type='submit'], button:not([type])");
          setSubmitState(button, true);

          (async () => {
            const formData = new FormData(form);
            const owner = formValue(formData, "owner");
            const repo = formValue(formData, "repo");
            if (!owner || !repo) {
              throw new Error("Missing repository access target.");
            }

            const body = new URLSearchParams();
            for (const [key, value] of formData.entries()) {
              body.set(key, String(value).trim());
            }

            const transaction = await fetchJson(
              "/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/access-transaction",
              {
                method: "POST",
                headers: { "content-type": "application/x-www-form-urlencoded" },
                body: body.toString()
              }
            );
            const chain = typeof transaction.chain === "string" ? transaction.chain : "sui:testnet";
            const senderWallet = typeof transaction.senderWallet === "string" ? transaction.senderWallet : "";
            const signer = await getAccessSigner(senderWallet, chain);
            if (senderWallet && signer.account.address.toLowerCase() !== senderWallet.toLowerCase()) {
              throw new Error("Connect the repository owner wallet to manage contributors.");
            }

            const result = await signer.wallet.features["sui:signAndExecuteTransaction"].signAndExecuteTransaction({
              account: signer.account,
              chain,
              transaction: {
                toJSON: async () => transaction.transactionJson
              }
            });
            const txDigest = typeof result?.digest === "string" ? result.digest : "";

            if (txDigest) {
              try {
                await fetchJson("/v1/sui/transactions/" + encodeURIComponent(txDigest) + "/wait");
              } catch (error) {
                console.warn(error);
              }
            }

            const activityBody = new URLSearchParams();
            activityBody.set("walletAddress", formValue(formData, "walletAddress"));
            activityBody.set("role", formValue(formData, "role"));
            activityBody.set("action", formValue(formData, "action"));
            if (txDigest) {
              activityBody.set("txDigest", txDigest);
            }
            try {
              await fetchJson(
                "/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo) + "/activity/access",
                {
                  method: "POST",
                  headers: { "content-type": "application/x-www-form-urlencoded" },
                  body: activityBody.toString()
                }
              );
            } catch (error) {
              console.warn(error);
            }

            window.location.assign(formValue(formData, "returnTo") || currentReturnTo());
          })().catch((error) => {
            setSubmitState(button, false);
            console.error(error);
            window.alert(error instanceof Error ? error.message : String(error));
          });
        });

        const webSession = async () => {
          return await fetchJson("/v1/auth/web-session");
        };

        const ensureWebSession = async (signer, returnTo) => {
          const session = await webSession();
          if (session.authenticated && session.walletAddress?.toLowerCase() === signer.account.address.toLowerCase()) {
            return session;
          }

          const challengeUrl = new URL("/v1/auth/web-session/challenge", window.location.origin);
          challengeUrl.searchParams.set("returnTo", returnTo || currentReturnTo());
          const challenge = await fetchJson(challengeUrl.pathname + challengeUrl.search);
          const signed = await signMessage(signer, challenge.message);
          return await fetchJson("/v1/auth/web-session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nonce: challenge.nonce,
              walletAddress: signer.account.address,
              signature: signed.signature
            })
          });
        };

        const unlockRepository = async (signer, owner, repo, returnTo) => {
          await ensureWebSession(signer, returnTo);
          const basePath = "/v1/repos/" + encodeURIComponent(owner) + "/" + encodeURIComponent(repo);
          const challengeUrl = new URL(basePath + "/unlock/challenge", window.location.origin);
          challengeUrl.searchParams.set("returnTo", returnTo || currentReturnTo());
          const challenge = await fetchJson(challengeUrl.pathname + challengeUrl.search);
          if (challenge.unlocked) {
            window.location.assign(returnTo || currentReturnTo());
            return;
          }

          const signed = await signMessage(signer, challenge.message);
          await fetchJson(basePath + "/unlock", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              nonce: challenge.nonce,
              signature: signed.signature
            })
          });
          window.location.assign(returnTo || currentReturnTo());
        };

        const parseRepoFromLocation = () => {
          const parts = window.location.pathname.split("/").filter(Boolean);
          return parts.length >= 2 ? { owner: decodeURIComponent(parts[0]), repo: decodeURIComponent(parts[1]) } : null;
        };

        document.addEventListener("click", (event) => {
          const trigger = event.target.closest("[data-octopus-auth-popup]");
          if (!trigger) {
            return;
          }
          const href = trigger.getAttribute("href");
          if (!href) {
            return;
          }
          event.preventDefault();
          const url = new URL(href, window.location.href);
          const mode = url.searchParams.get("mode") || "web";
          const returnTo = url.searchParams.get("returnTo") || currentReturnTo();
          const locationRepo = parseRepoFromLocation();
          const owner = url.searchParams.get("owner") || locationRepo?.owner || "";
          const repo = url.searchParams.get("repo") || locationRepo?.repo || "";
          trigger.setAttribute("aria-busy", "true");

          (async () => {
            const signer = await getSigner();
            if (mode === "unlock") {
              if (!owner || !repo) {
                throw new Error("Missing repository unlock target.");
              }
              await unlockRepository(signer, owner, repo, returnTo);
              return;
            }
            await ensureWebSession(signer, returnTo);
            window.location.assign(returnTo || currentReturnTo());
          })().catch((error) => {
            trigger.removeAttribute("aria-busy");
            console.error(error);
          });
        });
      })();
    </script>`;
