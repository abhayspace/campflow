import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Arrow, Brand, IssueIcon } from './MarketingBrand';
import '../pages/landing.css';

export default function AuthLayout({ title, subtitle, children, footer }: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="campus-auth">
      <aside className="auth-brand-panel">
        <Link to="/" aria-label="Campflow home"><Brand /></Link>
        <div className="auth-story">
          <p className="eyebrow">WELCOME TO A MORE CONNECTED CAMPUS.</p>
          <h2 className="auth-statement">A little less hassle.<br /><span>A whole lot<br />more campus.</span></h2>
          <p>A place for your reports, your updates, and the people who can help. Let’s make your everyday a little better.</p>
          <div className="auth-campus-photo"><img src="/images/campus-community.jpg" alt="Students sharing ideas in the library" width="1000" height="667" /><span>The best of campus. More of this.</span></div>
          <div className="auth-note"><span><IssueIcon kind="check" /></span><div><strong>You’re in the right place.</strong><p>Your campus community is one connection away.</p></div></div>
        </div>
        <div className="auth-brand-footer"><span>ONE CAMPUS. EVERYONE CONNECTED.</span><IssueIcon kind="campus" /></div>
      </aside>
      <div className="auth-form-panel">
        <div className="auth-topbar"><Link className="auth-mobile-brand" to="/" aria-label="Campflow home"><Brand /></Link><Link to="/" className="auth-back"><Arrow />Back to campus</Link></div>
        <main className="auth-form-wrap">
          <div className="auth-form-content">
            <h1>{title}</h1>
            {subtitle && <p className="auth-subtitle">{subtitle}</p>}
            <div className="auth-form-body">{children}</div>
            {footer && <div className="auth-form-footer">{footer}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}
