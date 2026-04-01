import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseBrowserKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function createMiddlewareResponse(request: NextRequest) {
  return NextResponse.next({
    request: {
      headers: request.headers,
    },
  });
}

function copyCookies(from: NextResponse, to: NextResponse) {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

async function getStaffRole(request: NextRequest) {
  if (!supabaseUrl || !supabaseBrowserKey) {
    return {
      role: null,
      response: createMiddlewareResponse(request),
    };
  }

  let response = createMiddlewareResponse(request);

  const supabase = createServerClient(supabaseUrl, supabaseBrowserKey, {
    cookies: {
      get(name: string) {
        return request.cookies.get(name)?.value;
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        response.cookies.set({ name, value, ...options });
      },
      remove(name: string, options: Record<string, unknown>) {
        response.cookies.set({ name, value: "", ...options });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      role: null,
      response,
    };
  }

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (data?.role === "admin" || data?.role === "judge") {
    return {
      role: data.role,
      response,
    };
  }

  return {
    role: null,
    response,
  };
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (!pathname.startsWith("/staff") || pathname.startsWith("/staff/login")) {
    return NextResponse.next();
  }

  const { role, response } = await getStaffRole(request);
  if (role) {
    return response;
  }

  const loginUrl = new URL("/staff/login", request.url);
  loginUrl.searchParams.set("redirect", `${pathname}${search}`);
  const redirectResponse = NextResponse.redirect(loginUrl);
  copyCookies(response, redirectResponse);
  return redirectResponse;
}

export const config = {
  matcher: ["/staff/:path*"],
};
