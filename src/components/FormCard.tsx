// Lifted form card — sits on the page with a strong shadow so it visually
// stacks above the hero/paper boundary. Negative top margin pulls the card
// up over the bottom of the hero to match the mockup composition.
//
// Header strip: small uppercase label centered on a slightly warmer band
// ("SIGN IN" / "GET STARTED" / "RESET PASSWORD" / etc.).
export default function FormCard({
  headerText,
  children,
}: {
  headerText: string
  children: React.ReactNode
}) {
  return (
    <div className="bb-card relative z-20 mx-auto -mt-20 sm:-mt-24 w-full max-w-md bb-fade-up">
      <div className="bb-card-header">{headerText}</div>
      <div className="bb-card-body">{children}</div>
    </div>
  )
}
