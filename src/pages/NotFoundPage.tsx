import { Link } from "react-router";

export function NotFoundPage() {
  return (
    <>
      <h1>Not done, not found</h1>
      <p>There is nothing at this address. Check the link, or start something new.</p>
      <Link className="button button--primary" to="/">
        Go home
      </Link>
    </>
  );
}
