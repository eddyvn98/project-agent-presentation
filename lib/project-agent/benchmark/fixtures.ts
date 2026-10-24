export interface BrowserBenchmarkAction {
  op: "click" | "fill" | "select" | "check";
  selector: string; value?: string;
}
export interface BrowserBenchmarkCase {
  id: string; category: string; html: string;
  actions: BrowserBenchmarkAction[]; verify: { selector: string; text?: string; visible?: boolean };
}
/** 40 local synthetic websites. Scripts and contents are authored here; no user sites are visited. */
export function browserBenchmarkFixtures(): BrowserBenchmarkCase[] {
  const all: BrowserBenchmarkCase[] = [];
  for (let n = 1; n <= 4; n++) {
    const marker = "Result " + n;
    const entries: Array<Omit<BrowserBenchmarkCase, "id">> = [
      { category: "search", html: '<input id="q"><button id="go" onclick="document.querySelector(\'#out\').textContent=\'Result '+n+'\'">Search</button><p id="out"></p>',
        actions: [{ op: "fill", selector: "#q", value: "query" + n }, { op: "click", selector: "#go" }],
        verify: { selector: "#out", text: marker } },
      { category: "tabs", html: '<button id="tab" onclick="document.querySelector(\'#panel\').textContent=\'Result '+n+'\'">Open tab</button><section id="panel">Inactive</section>',
        actions: [{ op: "click", selector: "#tab" }], verify: { selector: "#panel", text: marker } },
      { category: "form", html: '<form onsubmit="event.preventDefault();document.querySelector(\'#status\').textContent=\'Result '+n+'\'"><input id="name" required><button id="submit">Submit</button></form><p id="status"></p>',
        actions: [{ op: "fill", selector: "#name", value: "User" + n }, { op: "click", selector: "#submit" }],
        verify: { selector: "#status", text: marker } },
      { category: "dialog", html: '<button id="open" onclick="document.querySelector(\'#modal\').hidden=false">Open</button><div hidden id="modal"><button id="confirm" onclick="document.querySelector(\'#message\').textContent=\'Result '+n+'\'">Confirm</button></div><p id="message"></p>',
        actions: [{ op: "click", selector: "#open" }, { op: "click", selector: "#confirm" }],
        verify: { selector: "#message", text: marker } },
      { category: "filter", html: '<select id="category" onchange="document.querySelector(\'#out\').textContent=this.value===\''+n+'\'?\'Result '+n+'\':\'Nothing\'"><option value="">Choose</option><option value="'+n+'">Relevant</option></select><p id="out"></p>',
        actions: [{ op: "select", selector: "#category", value: String(n) }],
        verify: { selector: "#out", text: marker } },
      { category: "sort", html: '<button id="sort" onclick="document.querySelector(\'#order\').textContent=\'Result '+n+'\'">Sort ascending</button><div id="order">Unsorted</div>',
        actions: [{ op: "click", selector: "#sort" }], verify: { selector: "#order", text: marker } },
      { category: "async", html: '<div id="container"></div><script>setTimeout(()=>{let b=document.createElement("button");b.id="later";b.textContent="Load";b.onclick=()=>document.querySelector("#out").textContent="Result '+n+'";document.querySelector("#container").appendChild(b)},60)</script><p id="out"></p>',
        actions: [{ op: "click", selector: "#later" }], verify: { selector: "#out", text: marker } },
      { category: "pagination", html: '<button id="next" onclick="document.querySelector(\'#page\').textContent=\'Result '+n+'\'">Next page</button><p id="page">Page 1</p>',
        actions: [{ op: "click", selector: "#next" }], verify: { selector: "#page", text: marker } },
      { category: "checkbox", html: '<label><input type="checkbox" id="agree" onchange="document.querySelector(\'#out\').textContent=this.checked?\'Result '+n+'\':\'No\'">Agree</label><p id="out"></p>',
        actions: [{ op: "check", selector: "#agree" }], verify: { selector: "#out", text: marker } },
      { category: "editor", html: '<textarea id="editor"></textarea><button id="save" onclick="document.querySelector(\'#out\').textContent=document.querySelector(\'#editor\').value">Save</button><div id="out"></div>',
        actions: [{ op: "fill", selector: "#editor", value: marker }, { op: "click", selector: "#save" }],
        verify: { selector: "#out", text: marker } },
    ];
    for (const entry of entries) all.push({ id: entry.category + "-" + n, ...entry });
  }
  return all;
}
