import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../state/AppContext';
import { Overlay } from '../hooks/useOverlay';
import { Icon } from './Icon';

interface Slide {
  title: string;
  sub: string;
  art: ReactNode;
}

const OB_SLIDES: Slide[] = [
  {
    title: 'Your shop, in your pocket',
    sub: 'A complete point of sale for your warung — inventory, cashier and daily reports in one place.',
    art: (
      <div className="mock-phone">
        <div className="mock-wallet">
          <span className="mk-l w-40" />
          <span className="mk-l w-75 thick" />
          <span className="mk-chip">Rp 2.410.000</span>
        </div>
        <div className="mock-row">
          <span className="mock-t">☕</span>
          <span className="mk-stack">
            <span className="mk-l w-60" />
            <span className="mk-l w-40" />
          </span>
          <span className="mk-price">18k</span>
        </div>
        <div className="mock-row">
          <span className="mock-t">🥐</span>
          <span className="mk-stack">
            <span className="mk-l w-55" />
            <span className="mk-l w-35" />
          </span>
          <span className="mk-price">15k</span>
        </div>
        <div className="mock-row">
          <span className="mock-t">🍜</span>
          <span className="mk-stack">
            <span className="mk-l w-60" />
            <span className="mk-l w-45" />
          </span>
          <span className="mk-price">15k</span>
        </div>
      </div>
    ),
  },
  {
    title: 'Add what you sell',
    sub: 'Catalog products with prices, stock levels, units and photos in seconds.',
    art: (
      <>
        <div className="mock-card">
          <span className="mock-t big">🍜</span>
          <span className="mk-stack" style={{ width: '100%' }}>
            <span className="mk-l w-70" />
            <span className="mk-l w-45" />
          </span>
          <span className="mock-tag">Rp 15.000 · 18 pcs</span>
        </div>
        <span className="mock-plus">+</span>
        <span className="mock-chip-float">
          <Icon name="check" size={12} /> Saved to catalog
        </span>
      </>
    ),
  },
  {
    title: 'Serve buyers in three steps',
    sub: 'Pick items, confirm the cart, collect the payment. Receipts print instantly.',
    art: (
      <div>
        <div className="mock-steps">
          <span className="mock-step filled">✓</span>
          <i />
          <span className="mock-step filled">✓</span>
          <i />
          <span className="mock-step">3</span>
        </div>
        <div className="mock-pay">
          <span>Pick items</span>
          <span>Confirm cart</span>
          <span className="ok">✓ Paid</span>
        </div>
      </div>
    ),
  },
  {
    title: 'See how the day went',
    sub: 'Revenue, busiest days and top sellers — know exactly how your shop is doing.',
    art: (
      <>
        <div className="mock-chart">
          <i style={{ '--h': '35%' } as CSSProperties} />
          <i style={{ '--h': '55%' } as CSSProperties} />
          <i style={{ '--h': '42%' } as CSSProperties} />
          <i className="hot" style={{ '--h': '92%' } as CSSProperties} />
          <i style={{ '--h': '64%' } as CSSProperties} />
          <i style={{ '--h': '48%' } as CSSProperties} />
        </div>
        <span className="mock-delta">▲ +18.2% today</span>
      </>
    ),
  },
];

export function Onboarding() {
  const { completeOnboarding } = useApp();
  const [index, setIndex] = useState(0);
  const touchStart = useRef<number | null>(null);

  const goTo = (next: number) => {
    setIndex(Math.max(0, Math.min(OB_SLIDES.length - 1, next)));
  };

  const advance = () => {
    if (index >= OB_SLIDES.length - 1) completeOnboarding();
    else goTo(index + 1);
  };

  return (
    <Overlay className="ob-ov" dismissible={false} onClose={completeOnboarding}>
      {() => (
        <div className="ob-shell">
          <div className="ob-top">
            <div className="ob-brand">
              <span className="ob-mark">K</span> Kasir Digital
            </div>
            <button className="ob-skip" onClick={completeOnboarding}>
              Skip
            </button>
          </div>
          <div
            className="ob-viewport"
            id="ob-viewport"
            onTouchStart={(event) => {
              touchStart.current = event.touches[0]?.clientX ?? null;
            }}
            onTouchEnd={(event) => {
              if (touchStart.current == null) return;
              const dx = (event.changedTouches[0]?.clientX ?? 0) - touchStart.current;
              if (dx < -42) advance();
              else if (dx > 42 && index > 0) goTo(index - 1);
              touchStart.current = null;
            }}
          >
            <div
              className="ob-track"
              id="ob-track"
              style={{ transform: `translateX(-${index * 100}%)` }}
            >
              {OB_SLIDES.map((slide) => (
                <div className="ob-slide" key={slide.title}>
                  <div className="ob-art">{slide.art}</div>
                  <h2 className="ob-title">{slide.title}</h2>
                  <p className="ob-sub">{slide.sub}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="ob-dots" id="ob-dots">
            {OB_SLIDES.map((slide, i) => (
              <i key={slide.title} className={i === index ? 'on' : ''} />
            ))}
          </div>
          <button className="btn primary ob-next" id="ob-next" onClick={advance}>
            {index === OB_SLIDES.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      )}
    </Overlay>
  );
}
