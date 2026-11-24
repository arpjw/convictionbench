window.convictionReleases = {
  E2_sft: {
    name: 'Conviction Anchor 1.7B',
    shortName: 'Anchor',
    repo: 'Laplace-AI-Research/Conviction-Anchor-1.7B'
  },
  E3b_grpo_base: {
    name: 'Conviction Vector 1.7B',
    shortName: 'Vector',
    repo: 'Laplace-AI-Research/Conviction-Vector-1.7B'
  },
  V2: {
    name: 'Conviction Meridian 1.7B',
    shortName: 'Meridian',
    repo: 'Laplace-AI-Research/Conviction-Meridian-1.7B',
    note: '1,000-example SFT warm-start followed by the same 200-step GRPO recipe as Vector.'
  },
  SIG_9B_a6w250: {
    name: 'Signet-9B',
    shortName: 'Signet-9B',
    repo: 'Laplace-AI-Research/Signet-9B',
    note: 'Trained on the ConvictionBench train split: 250-example warm-start, then 200 GRPO steps on Qwen3.5-9B. Released 2026-11-24.'
  },
  SIG_4B_r1: {
    name: 'Signet-4B',
    shortName: 'Signet-4B',
    repo: 'Laplace-AI-Research/Signet-4B',
    note: 'Trained on the ConvictionBench train split: 400 GRPO steps from Qwen3.5-4B. Released 2026-11-24.'
  },
  SIG_2B_r1: {
    name: 'Signet-2B',
    shortName: 'Signet-2B',
    repo: 'Laplace-AI-Research/Signet-2B',
    note: 'Trained on the ConvictionBench train split: 400 GRPO steps from Qwen3.5-2B. Released 2026-11-24.'
  }
};
