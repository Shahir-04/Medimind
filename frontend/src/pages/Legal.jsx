import React from 'react'
import { Contact, HeartPulse, Mail, ShieldCheck } from 'lucide-react'

const UPDATED_AT = 'June 11, 2026'
const SUPPORT_EMAIL = 'admin.medmind@gmail.com'

const pageCopy = {
  privacy: {
    title: 'Privacy Policy',
    intro:
      'MediMind is designed to help users organize health context and interact with an AI medical assistant. This policy explains what information we collect, how we use it, and the choices you have.',
    sections: [
      {
        heading: 'Information We Collect',
        body:
          'We may collect account details such as your email address, login provider, verification status, profile information you choose to provide, chat messages, health notes, uploaded medical documents, and technical information needed to keep the service secure and reliable.',
      },
      {
        heading: 'How We Use Information',
        body:
          'We use your information to create and secure your account, send verification emails, provide AI chat and document features, maintain conversation history, improve service reliability, and respond to support or safety requests.',
      },
      {
        heading: 'Health And Medical Information',
        body:
          'MediMind may process health-related information you provide. The service is for informational support and organization only. It is not a replacement for a licensed medical professional, diagnosis, treatment, emergency care, or medical advice.',
      },
      {
        heading: 'Service Providers',
        body:
          'We use trusted infrastructure and API providers to operate MediMind, including hosting, authentication, database, email delivery, AI processing, and analytics or reliability tooling. These providers process data only as needed to provide their services to MediMind.',
      },
      {
        heading: 'Data Security',
        body:
          'We use reasonable administrative and technical safeguards, including authenticated access, HTTPS, protected environment secrets, and database access controls. No internet service can guarantee absolute security.',
      },
      {
        heading: 'Your Choices',
        body:
          'You can choose what information to provide, avoid uploading sensitive documents, request help with account or data questions, and stop using the service at any time.',
      },
      {
        heading: 'Contact',
        body: `For privacy questions or account support, contact us at ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  terms: {
    title: 'Terms of Service',
    intro:
      'These terms govern your access to and use of MediMind. By creating an account or using the service, you agree to use MediMind responsibly and only for lawful purposes.',
    sections: [
      {
        heading: 'Use Of MediMind',
        body:
          'MediMind provides tools for health-context organization, AI-assisted conversation, and document-based reference. You are responsible for the accuracy of the information you provide and for how you use the service.',
      },
      {
        heading: 'No Medical Advice',
        body:
          'MediMind does not provide medical diagnosis, treatment, emergency services, or professional medical advice. Always consult a qualified healthcare professional for medical decisions. If you may be experiencing an emergency, contact local emergency services immediately.',
      },
      {
        heading: 'Account Security',
        body:
          'You are responsible for maintaining access to your email account, protecting your login credentials, and notifying us if you believe your account has been misused.',
      },
      {
        heading: 'Acceptable Use',
        body:
          'Do not use MediMind to harm others, attempt unauthorized access, upload malicious content, interfere with the service, abuse email verification, or submit content that violates applicable law.',
      },
      {
        heading: 'Uploaded Content',
        body:
          'You retain responsibility for files, messages, and health information you upload or enter. You should only submit content that you have the right to use and that you are comfortable processing through the service.',
      },
      {
        heading: 'Service Availability',
        body:
          'We aim to keep MediMind reliable, but the service may change, pause, or become unavailable due to maintenance, third-party outages, security needs, or operational limits.',
      },
      {
        heading: 'Contact',
        body: `For questions about these terms, contact us at ${SUPPORT_EMAIL}.`,
      },
    ],
  },
  contact: {
    title: 'Contact',
    intro:
      'For account, privacy, or safety questions about MediMind, contact the project support address below.',
    sections: [
      {
        heading: 'Support Email',
        body: SUPPORT_EMAIL,
      },
      {
        heading: 'Production Service',
        body:
          'MediMind is operated as a web application with a frontend, backend API, authentication, email verification, and AI-assisted health-context features.',
      },
      {
        heading: 'Urgent Medical Needs',
        body:
          'MediMind cannot handle medical emergencies. If you need urgent medical help, contact your local emergency number or a qualified healthcare provider immediately.',
      },
    ],
  },
}

export default function LegalPage({ type = 'privacy' }) {
  const page = pageCopy[type] || pageCopy.privacy

  return (
    <main className="min-h-screen bg-white text-neutral-900 dark:bg-neutral-950 dark:text-neutral-50">
      <header className="border-b border-neutral-200 bg-white/95 dark:border-neutral-800 dark:bg-neutral-950/95">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-5">
          <a href="/" className="flex items-center gap-2 text-[#2E81D4]">
            <Contact className="h-7 w-7" />
            <span className="text-lg font-bold tracking-wide text-neutral-950 dark:text-white">MediMind</span>
          </a>
          <nav className="flex items-center gap-4 text-sm font-medium text-neutral-600 dark:text-neutral-300">
            <a href="/privacy" className="hover:text-[#2E81D4]">Privacy</a>
            <a href="/terms" className="hover:text-[#2E81D4]">Terms</a>
            <a href="/contact" className="hover:text-[#2E81D4]">Contact</a>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-10 flex items-start gap-4">
          <div className="mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded bg-[#E8F3FF] text-[#2E81D4] dark:bg-[#123558]">
            {type === 'terms' ? <ShieldCheck className="h-6 w-6" /> : type === 'contact' ? <Mail className="h-6 w-6" /> : <HeartPulse className="h-6 w-6" />}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-[#2E81D4]">Last updated {UPDATED_AT}</p>
            <h1 className="text-4xl font-extrabold tracking-tight">{page.title}</h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-neutral-600 dark:text-neutral-300">{page.intro}</p>
          </div>
        </div>

        <div className="space-y-8">
          {page.sections.map((section) => (
            <section key={section.heading} className="border-t border-neutral-200 pt-6 dark:border-neutral-800">
              <h2 className="text-xl font-bold">{section.heading}</h2>
              <p className="mt-3 text-base leading-7 text-neutral-700 dark:text-neutral-300">{section.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-12 border-t border-neutral-200 pt-6 text-sm text-neutral-500 dark:border-neutral-800 dark:text-neutral-400">
          <p>MediMind is not an emergency service or a substitute for professional medical care.</p>
          <a href="/" className="mt-4 inline-block font-semibold text-[#2E81D4] hover:underline">Return to MediMind</a>
        </div>
      </div>
    </main>
  )
}
