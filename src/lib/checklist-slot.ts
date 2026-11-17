/** Keep the provider setup card inside its desk column, including delayed loads. */
export function placeChecklistSlot(page: HTMLElement, el: HTMLElement, provider: boolean) {
  const reserve = page.querySelector<HTMLElement>("[data-ke=provider-setup-reserve]");
  if (provider) {
    if (reserve && el.parentElement !== reserve) reserve.appendChild(el);
    else if (!reserve && el.isConnected) el.remove();
  } else if (el.parentElement !== page) {
    page.insertBefore(el, page.firstChild);
  }
}
