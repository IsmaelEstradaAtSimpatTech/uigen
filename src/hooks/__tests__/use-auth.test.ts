import { test, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

// --- Mocks -----------------------------------------------------------------

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";

beforeEach(() => {
  vi.clearAllMocks();
  // Sensible defaults: no anon work, no existing projects.
  (getAnonWorkData as any).mockReturnValue(null);
  (getProjects as any).mockResolvedValue([]);
  (createProject as any).mockResolvedValue({ id: "new-project-id" });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// --- Initial state ---------------------------------------------------------

test("exposes signIn, signUp, and isLoading", () => {
  const { result } = renderHook(() => useAuth());

  expect(typeof result.current.signIn).toBe("function");
  expect(typeof result.current.signUp).toBe("function");
  expect(result.current.isLoading).toBe(false);
});

// --- signIn: happy paths ---------------------------------------------------

test("signIn returns the action result on success", async () => {
  (signInAction as any).mockResolvedValue({ success: true });

  const { result } = renderHook(() => useAuth());

  let returned: any;
  await act(async () => {
    returned = await result.current.signIn("user@example.com", "password123");
  });

  expect(signInAction).toHaveBeenCalledWith("user@example.com", "password123");
  expect(returned).toEqual({ success: true });
});

test("signIn adopts anonymous work into a new project and navigates to it", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({
    messages: [{ role: "user", content: "hi" }],
    fileSystemData: { "/App.jsx": { type: "file", content: "x" } },
  });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@example.com", "password123");
  });

  expect(createProject).toHaveBeenCalledTimes(1);
  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({
      messages: [{ role: "user", content: "hi" }],
      data: { "/App.jsx": { type: "file", content: "x" } },
    })
  );
  expect(clearAnonWork).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/new-project-id");
  // Should not fall through to fetching existing projects.
  expect(getProjects).not.toHaveBeenCalled();
});

test("signIn navigates to the most recent project when no anon work exists", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([
    { id: "recent-project" },
    { id: "older-project" },
  ]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@example.com", "password123");
  });

  expect(getProjects).toHaveBeenCalledTimes(1);
  expect(createProject).not.toHaveBeenCalled();
  expect(clearAnonWork).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/recent-project");
});

test("signIn creates a fresh project when there is no anon work and no projects", async () => {
  (signInAction as any).mockResolvedValue({ success: true });

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@example.com", "password123");
  });

  expect(createProject).toHaveBeenCalledTimes(1);
  expect(createProject).toHaveBeenCalledWith(
    expect.objectContaining({ messages: [], data: {} })
  );
  expect(mockPush).toHaveBeenCalledWith("/new-project-id");
});

// --- signIn: edge cases ----------------------------------------------------

test("signIn does not run post-sign-in flow when the action fails", async () => {
  (signInAction as any).mockResolvedValue({
    success: false,
    error: "Invalid credentials",
  });

  const { result } = renderHook(() => useAuth());

  let returned: any;
  await act(async () => {
    returned = await result.current.signIn("user@example.com", "wrong");
  });

  expect(returned).toEqual({ success: false, error: "Invalid credentials" });
  expect(getAnonWorkData).not.toHaveBeenCalled();
  expect(getProjects).not.toHaveBeenCalled();
  expect(createProject).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test("signIn treats anon work with no messages as no anon work", async () => {
  (signInAction as any).mockResolvedValue({ success: true });
  (getAnonWorkData as any).mockReturnValue({
    messages: [],
    fileSystemData: {},
  });
  (getProjects as any).mockResolvedValue([{ id: "recent-project" }]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signIn("user@example.com", "password123");
  });

  // Empty messages => skip adoption, fall through to existing projects.
  expect(clearAnonWork).not.toHaveBeenCalled();
  expect(createProject).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith("/recent-project");
});

// --- isLoading lifecycle ---------------------------------------------------

test("signIn toggles isLoading during the call and resets it afterward", async () => {
  let resolveAction: (value: { success: boolean }) => void;
  (signInAction as any).mockReturnValue(
    new Promise((resolve) => {
      resolveAction = resolve;
    })
  );

  const { result } = renderHook(() => useAuth());

  let signInPromise: Promise<any>;
  act(() => {
    signInPromise = result.current.signIn("user@example.com", "password123");
  });

  // While the action is pending, isLoading should be true.
  await waitFor(() => expect(result.current.isLoading).toBe(true));

  await act(async () => {
    resolveAction!({ success: false });
    await signInPromise;
  });

  expect(result.current.isLoading).toBe(false);
});

test("signIn resets isLoading even when the action throws", async () => {
  (signInAction as any).mockRejectedValue(new Error("network down"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await expect(
      result.current.signIn("user@example.com", "password123")
    ).rejects.toThrow("network down");
  });

  expect(result.current.isLoading).toBe(false);
});

// --- signUp: mirrors signIn ------------------------------------------------

test("signUp returns the action result on success", async () => {
  (signUpAction as any).mockResolvedValue({ success: true });

  const { result } = renderHook(() => useAuth());

  let returned: any;
  await act(async () => {
    returned = await result.current.signUp("new@example.com", "password123");
  });

  expect(signUpAction).toHaveBeenCalledWith("new@example.com", "password123");
  expect(returned).toEqual({ success: true });
});

test("signUp runs the post-sign-in flow on success", async () => {
  (signUpAction as any).mockResolvedValue({ success: true });
  (getProjects as any).mockResolvedValue([{ id: "recent-project" }]);

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await result.current.signUp("new@example.com", "password123");
  });

  expect(mockPush).toHaveBeenCalledWith("/recent-project");
});

test("signUp does not run post-sign-in flow when the action fails", async () => {
  (signUpAction as any).mockResolvedValue({
    success: false,
    error: "Email already registered",
  });

  const { result } = renderHook(() => useAuth());

  let returned: any;
  await act(async () => {
    returned = await result.current.signUp("dup@example.com", "password123");
  });

  expect(returned).toEqual({
    success: false,
    error: "Email already registered",
  });
  expect(getProjects).not.toHaveBeenCalled();
  expect(createProject).not.toHaveBeenCalled();
  expect(mockPush).not.toHaveBeenCalled();
});

test("signUp resets isLoading even when the action throws", async () => {
  (signUpAction as any).mockRejectedValue(new Error("network down"));

  const { result } = renderHook(() => useAuth());

  await act(async () => {
    await expect(
      result.current.signUp("new@example.com", "password123")
    ).rejects.toThrow("network down");
  });

  expect(result.current.isLoading).toBe(false);
});
