import { useParams } from 'react-router';

/** Reads a numeric id from the URL. Returns undefined when it is missing or not a valid id. */
export function useIdParam(name: string): number | undefined {
  const value = useParams()[name];
  const id = Number(value);
  return value && Number.isInteger(id) && id > 0 ? id : undefined;
}
