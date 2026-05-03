import { redirect } from 'next/navigation'

type RouteParams = Promise<{ id: string }>

// v27.1.1.0.3e.6: /app/trips/[id]/edit is folded into /app/trips/[id].
// The trip detail page IS the edit surface now (auto-save inline editor).
// This route stays as a redirect so any old in-the-wild links (emails,
// bookmarks, in-app history) land on the right place.
export default async function EditTripPage({ params }: { params: RouteParams }) {
  const { id } = await params
  redirect(`/app/trips/${id}`)
}
