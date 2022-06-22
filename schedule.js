function addStylesheet(shadow) {
	const stylesheets = ['schedule.css', 'style.css'];
	for (const stylesheet of stylesheets) {
		const el = document.createElement("link");
		el.setAttribute("rel", "stylesheet");
		el.setAttribute("href", stylesheet);
		shadow.appendChild(el);
	}
}

function parseTime(str) {
	const split = str.split(':');
	if (split.length === 2) {
		return {
			hours: parseInt(split[0], 10),
			minutes: parseInt(split[1], 10),
		}
	}

	return {
		hours: 0,
		minutes: parseInt(str, 10),
	}
}

function stringifyTime(time) {
	let hours = time.hours;
	let mins = time.minutes;

	while (mins >= 60) {
		hours += 1;
		mins -= 60;
	}

	const meridian = hours >= 12 ? "PM" : "AM";
	if (hours > 12) {
		hours -= 12;
	}

	return `${hours}:${mins.toString().padStart(2, '0')}\u{00A0}${meridian}`;
}

class RenderableHTMLElement extends HTMLElement {
	setAttribute(qualifiedName, value) {
		super.setAttribute(qualifiedName, value);
		this._render();
	}
}

/*
 * Container for a schedule display.
 */
customElements.define('schedule-container', class ScheduleContainer extends RenderableHTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});
		addStylesheet(shadow);

		const container = document.createElement("div");
		container.classList.add("schedule-container");

		this._legend = document.createElement("schedule-legend");
		container.appendChild(this._legend);

		const days = document.createElement("slot");
		days.setAttribute("name", "day");
		days.addEventListener('slotchange', () => setTimeout(() => this._render(), 0));
		container.appendChild(days);

		shadow.appendChild(container);
	}

	_render() {
		const config = {
			slotStart: parseTime(this.getAttribute("slot-start")),
			slotLength: parseTime(this.getAttribute("slot-length")),
			slots: parseInt(this.getAttribute("slots"), 10),
		};

		const configAttr = JSON.stringify(config);

		// Update the legend.
		this._legend.setAttribute("data-config", configAttr);

		// Update all the days.
		const targets = this.querySelectorAll('[slot="day"]');
		for (const target of targets) {
			target.setAttribute("data-config", configAttr);
		}
	}
});

/*
 * A day in the schedule.
 */
class ScheduleDay extends RenderableHTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: "open"});
		addStylesheet(shadow);

		this._title = document.createElement('schedule-day-date');
		this._title.setAttribute("date", this.getAttribute("date"));
		shadow.appendChild(this._title);

		this._container = document.createElement("div");
		this._container.classList.add("schedule-day-container");
		shadow.appendChild(this._container);

		this._ticks = document.createElement("schedule-day-ticks");
		this._events = document.createElement("schedule-day-events");
		this._container.appendChild(this._ticks);
		this._container.appendChild(this._events);
	}

	_render() {
		this._title.setAttribute("data-config", this.getAttribute("data-config"));
		this._ticks.setAttribute("data-config", this.getAttribute("data-config"));
		this._events.setAttribute("data-config", this.getAttribute("data-config"));
	}
}

customElements.define('schedule-day', ScheduleDay);

/*
 * Internal: Render for the time corresponding to each block.
 */
customElements.define('schedule-legend', class ScheduleLegend extends ScheduleDay {
	constructor() {
		super();

		this._container.classList.add("legend");

		this._title.setAttribute("date", (new Date()).toString());
		this._title.style.visibility = "hidden";

		this._ticks.classList.add("legend");
	}

	_render() {
		super._render();
	}
});


/*
 * A day in the schedule.
 */
customElements.define('schedule-day-date', class ScheduleDayDate extends RenderableHTMLElement {
	constructor() {
		super();
	}

	_render() {
		while (this.firstChild != null) this.removeChild(this.firstChild);
		const date = new Date(this.getAttribute("date"));

		// Add the day of week.
		const dayOfWeek = document.createElement("div");
		dayOfWeek.classList.add("schedule-day-of-week");
		dayOfWeek.textContent = [
			"SUN",
			"MON",
			"TUE",
			"WED",
			"THU",
			"FRI",
			"SAT",
		][date.getDay()];
		this.appendChild(dayOfWeek);

		// Add the day of the month.
		const dayOfMonth = document.createElement("div");
		dayOfMonth.classList.add("schedule-day-of-month");
		dayOfMonth.textContent = date.getDate().toString();
		this.appendChild(dayOfMonth);
	}
});

/*
 * Internal: Render for the lines between schedule blocks.
 */
customElements.define('schedule-day-ticks', class ScheduleDayTicks extends RenderableHTMLElement {
	constructor() {
		super();
	}

	_render() {
		const config = JSON.parse(this.getAttribute("data-config"));

		while (this.firstChild != null) this.removeChild(this.firstChild);
		let time = config.slotStart;
		for (let tick = 0; tick < config.slots; tick++, time = {hours: time.hours + config.slotLength.hours, minutes: time.minutes + config.slotLength.minutes}) {
			const el = document.createElement("div");
			el.classList.add('schedule-grid');
			el.textContent = stringifyTime(time);
			this.appendChild(el);
		}
	}
});

customElements.define('schedule-day-events', class ScheduleDayEvents extends RenderableHTMLElement {
	constructor() {
		super();

		const days = document.createElement("slot");
		days.setAttribute("name", "event");
		days.addEventListener('slotchange', () => setTimeout(() => this._render(), 0));

		this.appendChild(days);
	}

	_render() {
		const config = JSON.parse(this.getAttribute("data-config"));
		const minsPerSlot = (config.slotLength.hours * 60) + config.slotLength.minutes;
		const minsTop = (config.slotStart.hours * 60) + config.slotStart.minutes;

		// Determine depths for each slot.
		let eventsAt = [];
		for (let i = 0; i < config.slots; i++) {
			eventsAt[i] = new Set();
		}

		// Calculate slot info.
		const targets = this.getRootNode().host.querySelectorAll('[slot="event"]');
		for (const target of targets) {
			const start = parseTime(target.getAttribute("start"));
			const end = parseTime(target.getAttribute("end"));

			const length = (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes);
			target.lengthSlots = Math.ceil(length / minsPerSlot);
			target.offsetSlots = Math.floor(((start.hours * 60 + start.minutes) - minsTop) / minsPerSlot);
			const prio = config.slots - target.lengthSlots;

			for (let i = target.offsetSlots; i < (target.offsetSlots + target.lengthSlots); i++) {
				eventsAt[i].add(target);
			}

			target.style.setProperty("--slots", target.lengthSlots);
			target.style.setProperty("--offset", target.offsetSlots);
			target.style.setProperty("--priority", prio);
		}

		// "Shift" slots to the side.
		for (const target of targets) {
			let others = new Set();
			for (let i = target.offsetSlots; i < (target.offsetSlots + target.lengthSlots); i++) {
				for (const other of eventsAt[i]) {
					others.add(other);
				}
			}

			const sorted = Array.from(others.values()).sort((a, b) => b.lengthSlots - a.lengthSlots);
			target.style.setProperty("--depth", sorted.indexOf(target));
		}
	}
});


customElements.define('schedule-event', class ScheduleEvents extends RenderableHTMLElement {
	constructor() {
		super();
		const shadow = this.attachShadow({mode: 'open'});

		this._render();
	}

	_render() {
		while (this.shadowRoot.firstChild != null) this.shadowRoot.removeChild(this.shadowRoot.firstChild);
		addStylesheet(this.shadowRoot);

		const data = this.textContent.trim().split("\n")
			.map(l => l.trim());

		const evtTitle = data[0];
		const evtDescription = data.slice(1).join("\n").trim();

		const title = document.createElement("div");
		title.classList.add("event-title");
		title.textContent = evtTitle;

		const time = document.createElement("div");
		time.classList.add("event-time");
		time.textContent = `${stringifyTime(parseTime(this.getAttribute("start")))}\u{2013}${stringifyTime(parseTime(this.getAttribute("end")))}`;

		const description = document.createElement("div");
		description.classList.add("event-description");
		description.textContent = evtDescription;

		this.shadowRoot.appendChild(title);
		this.shadowRoot.appendChild(time);
		this.shadowRoot.appendChild(description);
	}
});

