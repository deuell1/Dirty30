import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  authFlowToggleLabel,
  completePhoneAuthentication,
  ExistingAccountNotice,
  preparePhoneSignIn,
} from "./phone-auth";

describe("existing Clerk account invitation recovery", () => {
  it("shows an explicit Sign Up action to new users", () => {
    expect(authFlowToggleLabel("signIn")).toBe("New to Dirty-30? Sign Up");
    expect(authFlowToggleLabel("signUp")).toBe(
      "Already have an account? Sign in",
    );
  });

  it("replaces the signup dead end with sign-in and cancel actions", () => {
    const markup = renderToStaticMarkup(
      <ExistingAccountNotice
        pending={false}
        onSignIn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(markup).toContain(
      "An account already exists with this phone number.",
    );
    expect(markup).toContain("button-sign-in-existing-account");
    expect(markup).toContain(">Sign In<");
    expect(markup).toContain("button-cancel-existing-account");
    expect(markup).toContain(">Cancel / Return<");
    expect(markup).toContain("min-h-12");
    expect(markup).toContain("min-h-11");
  });

  it("starts Clerk SMS sign-in for the existing account", async () => {
    const signIn = {
      create: vi.fn().mockResolvedValue({
        supportedFirstFactors: [
          { strategy: "phone_code", phoneNumberId: "phone_123" },
        ],
      }),
      prepareFirstFactor: vi.fn().mockResolvedValue(undefined),
    };

    await preparePhoneSignIn(signIn, "+13125550123");

    expect(signIn.create).toHaveBeenCalledWith({
      identifier: "+13125550123",
    });
    expect(signIn.prepareFirstFactor).toHaveBeenCalledWith({
      strategy: "phone_code",
      phoneNumberId: "phone_123",
    });
  });

  it("activates Clerk and returns to the preserved invitation", async () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();

    await completePhoneAuthentication(
      setActive,
      "session_123",
      "/invite/captain-token",
      navigate,
    );

    expect(setActive).toHaveBeenCalledWith({ session: "session_123" });
    expect(navigate).toHaveBeenCalledWith("/invite/captain-token");
    expect(setActive.mock.invocationCallOrder[0]).toBeLessThan(
      navigate.mock.invocationCallOrder[0],
    );
  });

  it("does not leave the current page when no invitation is preserved", async () => {
    const setActive = vi.fn().mockResolvedValue(undefined);
    const navigate = vi.fn();

    await completePhoneAuthentication(setActive, "session_123", null, navigate);

    expect(setActive).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
