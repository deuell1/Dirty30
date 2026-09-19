import { createRoot } from "react-dom/client";
import { ClerkProvider } from "@clerk/react";

import App from "./App";
import { ErrorBoundary } from "@/components/error-boundary";

import "./index.css";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
if (!clerkPubKey) {
  throw new Error("VITE_CLERK_PUBLISHABLE_KEY is required.");
}
createRoot(document.getElementById("root")!, {
  // Keeps caught errors off reportError(), which would raise the dev overlay.
  onCaughtError: (error, errorInfo) => {
    console.error(error, errorInfo.componentStack);
  },
}).render(
  <ClerkProvider publishableKey={clerkPubKey}>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </ClerkProvider>,
);
