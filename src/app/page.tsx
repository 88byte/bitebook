import LoginForm from './login/LoginForm'
import Hero from '@/components/Hero'
import FormCard from '@/components/FormCard'
import AccountHelp from '@/components/AccountHelp'
import Footer from '@/components/Footer'

export default function Home() {
  return (
    <main className="flex flex-col min-h-screen">
      <Hero
        taglineLine1="Track every hunt."
        taglineLine2="Build your history."
        subtitle="Log harvests, preserve field details, and organize your hunts in one place."
      />

      <section className="px-6 pb-12">
        <FormCard headerText="Sign in">
          <LoginForm />
          <AccountHelp />
        </FormCard>
      </section>

      <Footer />
    </main>
  )
}
