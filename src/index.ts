import c2j from 'convert-csv-to-json';
import { Hono } from 'hono';
import knn from 'sphere-knn';

type CSV = {
	zip: string;
	type: string;
	decommissioned: string;
	primary_city: string;
	acceptable_cities: string;
	unacceptable_cities: string;
	state: string;
	county: string;
	timezone: string;
	area_codes: string;
	world_region: string;
	country: string;
	latitude: number;
	longitude: number;
	irs_estimated_population: number;
};

type LISTITEM = {
	latitude: number;
	longitude: number;
};

const app = new Hono<{ Bindings: Env }>();

app.get('/zipcode/:zip', async (c) => {
	const zip = c.req.param('zip');
	if (!zip || zip.length !== 5 || isNaN(Number(zip))) {
		return new Response('Invalid ZIP code', { status: 400 });
	}
	const { ZIPCODE } = c.env;
	const zipCodeData = await ZIPCODE.get<CSV>(zip, 'json');
	if (!zipCodeData) {
		return new Response('ZIP code not found', { status: 404 });
	}
	return c.json(zipCodeData);
});

app.get('/reverse/:lat/:long', async (c) => {
	const lat = parseFloat(c.req.param('lat') || '');
	const long = parseFloat(c.req.param('long') || '');
	if (!lat || !long) {
		return new Response('Invalid latitude or longitude', { status: 400 });
	}
	const { ZIPCODE, RADIUS } = c.env;
	const list = await ZIPCODE.get<LISTITEM[]>('LIST', 'json');
	if (!list) {
		return new Response('Failed to fetch master ZIP code data', { status: 500 });
	}

	if (list.length === 0) {
		return new Response('No ZIP codes available', { status: 404 });
	}
	if (RADIUS <= 0 || isNaN(RADIUS)) {
		return new Response('Invalid radius value', { status: 400 });
	}

	const lookup = knn(list.map((item) => ({ latitude: item.latitude, longitude: item.longitude })));
	const result = lookup(lat, long, 1, RADIUS) as LISTITEM[];
	if (result.length === 0) {
		return new Response('No ZIP code found for the given coordinates', { status: 404 });
	}

	const master = await ZIPCODE.get<CSV[]>('MASTER', 'json');
	if (!master) {
		return new Response('Failed to fetch master ZIP code data', { status: 500 });
	}
	const found = master.filter((item) => item.latitude === result[0].latitude && item.longitude === result[0].longitude);
	if (found.length === 0) {
		return new Response('No ZIP code found for the given coordinates', { status: 404 });
	}
	const zipCode = found[0].zip;
	const city = found[0].primary_city || found[0].acceptable_cities || 'Unknown';
	return Response.json({ lat, long, result: result[0], zipCode, city });
});

app.post('/populate', async (c) => {
	const startTime = performance.now();
	const url = new URL(c.req.url);
	url.pathname = '/zip_code_database.csv';
	const file = await c.env.ASSETS.fetch(url);
	if (!file.ok) {
		return c.json({ error: 'Failed to fetch CSV file' }, 500);
	}
	const csv = await file.text();
	const jsonArray = c2j.fieldDelimiter(',').csvStringToJson(csv) as CSV[];
	const { ZIPCODE } = c.env;

	await ZIPCODE.put('MASTER', JSON.stringify(jsonArray), {
		metadata: {
			description: 'List of all ZIP codes',
		},
	});
	console.debug(`Found ${jsonArray.length} ZIP codes in the master list`);

	const list = jsonArray.map((item) => ({
		latitude: item.latitude,
		longitude: item.longitude,
	}));
	console.debug(`Found ${list.length} ZIP codes with latitude and longitude`);

	await ZIPCODE.put('LIST', JSON.stringify(list), {
		metadata: {
			description: 'List of all ZIP codes with latitude and longitude',
		},
	});

	const endTime = performance.now();
	return new Response(`Finished uploading ${jsonArray.length} ZIP code datas in ${((endTime - startTime) / 1000).toFixed(2)} seconds`, {
		status: 200,
	});
});

app.get('/bulk', async (c) => {
	const startTime = performance.now();
	const url = new URL(c.req.url);
	url.pathname = '/zip_code_database.csv';
	const file = await c.env.ASSETS.fetch(url);
	if (!file.ok) {
		return c.json({ error: 'Failed to fetch CSV file' }, 500);
	}
	const csv = await file.text();
	const jsonArray = c2j.fieldDelimiter(',').csvStringToJson(csv) as CSV[];

	const returnList = [];
	for (let i = 0; i < jsonArray.length; i++) {
		returnList.push({
			key: jsonArray[i].zip.toString(),
			value: JSON.stringify(jsonArray[i]),
			metadata: {
				zip: jsonArray[i].zip,
				long: jsonArray[i].longitude,
				latitude: jsonArray[i].latitude,
			},
		});
	}

	return c.json(returnList, 200);
});

app.get('/list', async (c) => {
	const startTime = performance.now();
	const { ZIPCODE } = c.env;
	const list = await ZIPCODE.get<LISTITEM[]>('LIST', 'json');
	if (!list) {
		return c.json({ error: 'Failed to fetch ZIP code list' }, 500);
	}
	console.debug('Finished fetching all ZIP codes', list.length);
	const endTime = performance.now();
	console.debug(`Fetching all ZIP codes took ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
	return c.json(list);
});

app.get('/all', async (c) => {
	const startTime = performance.now();
	const { ZIPCODE } = c.env;
	let kvResult = await ZIPCODE.list({ limit: 1000 });
	let list = kvResult.keys;
	while (!kvResult.list_complete) {
		kvResult = await ZIPCODE.list({ cursor: kvResult.cursor, limit: 1000 });
		list.push(...kvResult.keys);
	}
	list = list.filter((item) => item.name !== 'MASTER' && item.name !== 'LIST');

	console.debug('Finished fetching all ZIP codes', list.length);
	const endTime = performance.now();
	console.debug(`Fetching all ZIP codes took ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
	return c.json(list);
});

app.get('/master', async (c) => {
	const startTime = performance.now();
	const { ZIPCODE } = c.env;
	const kvResult = await ZIPCODE.get<CSV[]>('MASTER', 'json');
	if (!kvResult) {
		return c.json({ error: 'Failed to fetch master ZIP code data' }, 500);
	}
	console.debug('Finished fetching all ZIP codes', kvResult.length);
	const endTime = performance.now();
	console.debug(`Fetching all ZIP codes took ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
	return c.json(kvResult);
});

app.onError((err, c) => {
	console.error('Error occurred:', err);
	return c.json({ error: 'Internal Server Error' }, 500);
});

export default app;
