import { onUnmounted, watch, type Ref } from 'vue';
import { gsap } from 'gsap';

export function useCollectionMotion(root: Ref<HTMLElement | null>, ready: Ref<boolean>) {
  let media: ReturnType<typeof gsap.matchMedia> | undefined;
  let played = false;

  watch([root, ready], async ([el, isReady]) => {
    if (!el || !isReady || played) return;
    played = true;
    await Promise.resolve();
    media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.from(el.querySelectorAll('.page-header, .table-toolbar, .collection-surface'), {
        autoAlpha: 0, y: 6, duration: 0.2, stagger: 0.04, ease: 'power1.out', clearProps: 'all',
      });
    }, el);
  }, { flush: 'post' });

  onUnmounted(() => {
    media?.revert();
    media = undefined;
  });
}

export function useDashboardMotion(root: Ref<HTMLElement | null>, ready: Ref<boolean>) {
  let media: ReturnType<typeof gsap.matchMedia> | undefined;

  watch([root, ready], async ([el, isReady]) => {
    media?.revert();
    media = undefined;
    if (!el || !isReady) return;
    await Promise.resolve();
    media = gsap.matchMedia();
    media.add('(prefers-reduced-motion: no-preference)', () => {
      const metrics = el.querySelectorAll('.dashboard-metric');
      const tasks = el.querySelectorAll('.dashboard-task-list > button');
      if (metrics.length) {
        gsap.from(metrics, { autoAlpha: 0, y: 4, duration: 0.2, stagger: 0.025, ease: 'power1.out', clearProps: 'all' });
      }
      if (tasks.length) {
        gsap.from(tasks, { autoAlpha: 0, y: 4, duration: 0.18, stagger: 0.02, ease: 'power1.out', delay: 0.04, clearProps: 'all' });
      }
    }, el);
  }, { flush: 'post' });

  onUnmounted(() => {
    media?.revert();
    media = undefined;
  });
}
