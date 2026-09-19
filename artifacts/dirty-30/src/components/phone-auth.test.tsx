import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ExistingAccountNotice, preparePhoneSignIn } from "./phone-auth";

describe("existing Clerk account invitation recovery", () => {
  it("replaces the signup dead end with sign-in and cancel actions", () => {
    const markup = renderToStaticMarkup(
      <ExistingAccountNotice
        pending={false}
        onSignIn={vi.fn()}
        onCancel={vi.fn()}
      />,
    );

    expect(markup).toContain(
      "An account already exists with this phone number. Sign in to continue.",
    );
    expect(markup).toContain("button-sign-in-existing-account");
    expect(markup).toContain(">Sign In<");
    expect(markup).toContain("button-cancel-existing-account");
    expect(markup).toContain(">Cancel<");
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
});
