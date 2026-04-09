import { expect, test, describe, spyOn, afterAll, mock } from "bun:test";
import { register, login } from "../../src/application/user_application";
import pg, { redis } from "../../src/utils/db";
import {
  createItem,
  createItemV2,
  addItemTags,
  deleteItemTags,
  getItemsById,
  getAllItems,
  getItemByUserId,
  getAllCategories,
  getAllTags,
  updateItem,
  deleteItem,
} from "../../src/application/item_application";
import { generateAuthenticatedRequest, generateRequest } from "../test_helper";
import { beforeEach, afterEach } from "node:test";
import * as itemQueries from "../../src/database/queries/item_queries";
import * as authUtils from "../../src/utils/jwt_config";

const itemId1 = "537d8f9c-bd93-484a-b14c-ce1853456a15";
const itemId2 = "99c1a581-510a-4467-91b5-112b78362f03";
const itemId3 = "ff44b3f7-0f88-413e-b359-bb6750fb0001";
let sellerId: string | null = null;
let sellerId2: string | null = null;

beforeEach(async () => {
  await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
  await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
  await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

  const registerReq = generateRequest(
    "http://localhost/auth/register",
    "POST",
    {
      email: "jasonli1234@gmail.com",
      username: "test",
      password: "testing123",
    },
  );

  const registerReq2 = generateRequest(
    "http://localhost/auth/register",
    "POST",
    {
      email: "jasonli8909@gmail.com",
      username: "test2",
      password: "testing123",
    },
  );

  const userRes = await register(registerReq);
  const userRes2 = await register(registerReq2);
  sellerId = (await userRes.json()).user;
  sellerId2 = (await userRes2.json()).user;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId1}, ${sellerId}, ${"test_item"}, ${9.5}, ${20})
  `;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId2}, ${sellerId2}, ${"test_item2"}, ${2.5}, ${10})
  `;

  await pg`
  insert into items
  (item_id, seller_id, item_name, price, quantity_available)
  values
  (${itemId3}, ${sellerId}, ${"test_item3"}, ${10.5}, ${25})
  `;
});

afterAll(async () => {
  await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
  await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
  await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
});

describe("Create item tests", () => {
  let accessToken: string;
  let createdSellerId: string;

  beforeEach(async () => {
    await pg`delete from items`;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('createitem@gmail.com')`;

    const registerReq = generateRequest("http://localhost/auth/register", "POST", {
      email: "createitem@gmail.com",
      username: "createitemuser",
      password: "testing123",
    });

    const registerRes = await register(registerReq);
    createdSellerId = (await registerRes.json()).user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "createitem@gmail.com",
      password: "testing123",
    });

    const loginRes = await login(loginReq);
    accessToken = (await loginRes.json()).accessToken;
  });

  afterAll(async () => {
    await pg`delete from items`;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('createitem@gmail.com')`;
  });

  test("returns 401 when authorization header is missing", async () => {
    const request = generateRequest("/items", "POST", {
      itemName: "Keyboard",
      price: 50,
      quantityAvailable: 10,
    });

    request.headers = {
      "content-type": "application/json",
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authorization is header missing");
  });

  test("returns 415 for unsupported content type", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        price: 50,
        quantityAvailable: 10,
      },
      accessToken,
    );

    request.headers = {
      "content-type": "text/plain",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_TYPE");
    expect(body.message).toBe("This content type is not supported");
  });

  test("returns 400 when required item fields are missing", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        description: "Missing required fields",
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });

  test("returns 400 when description type is invalid", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        description: 12345,
        price: 50,
        quantityAvailable: 10,
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });

  test("returns 400 when imageUrl type is invalid", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        price: 50,
        quantityAvailable: 10,
        imageUrl: 12345,
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });

  test("creates item successfully", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        description: "Mechanical keyboard",
        price: 50,
        quantityAvailable: 10,
        imageUrl: "https://example.com/image.png",
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toBe("Item created successfully");
    expect(body.item).not.toBe(undefined);

    const query = await pg`select * from items where item_name = ${"Keyboard"}`;
    expect(query.length).toBe(1);
    expect(query[0].seller_id).toBe(createdSellerId);
    expect(query[0].description).toBe("Mechanical keyboard");
    expect(Number(query[0].price)).toBe(50);
    expect(Number(query[0].quantity_available)).toBe(10);
    expect(query[0].image_url).toBe("https://example.com/image.png");
  });

  test("returns 400 when price is invalid", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        price: -10,
        quantityAvailable: 10,
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });

  test("returns 400 when quantityAvailable is invalid", async () => {
    const request = generateAuthenticatedRequest(
      "/items",
      "POST",
      {
        itemName: "Keyboard",
        price: 50,
        quantityAvailable: -1,
      },
      accessToken,
    );

    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItem(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });
});

describe("Create item v2 tests", () => {
  let accessToken: string;

  beforeEach(async () => {
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('createitemv2@gmail.com')`;

    const registerReq = generateRequest("http://localhost/auth/register", "POST", {
      email: "createitemv2@gmail.com",
      username: "createitemv2user",
      password: "testing123",
    });

    await register(registerReq);

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "createitemv2@gmail.com",
      password: "testing123",
    });

    const loginRes = await login(loginReq);
    accessToken = (await loginRes.json()).accessToken;
  });

  afterEach(() => {
    mock.restore();
  });

  afterAll(async () => {
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('createitemv2@gmail.com')`;
  });

  test("returns 401 when authorization header is missing", async () => {
    const request = generateRequest("/items/v2", "POST", {
      itemName: "Chair",
      price: 100,
      quantityAvailable: 3,
      categoryName: "Furniture",
      tags: ["Modern"],
    });
    request.headers = {
      "content-type": "application/json",
    };

    const response = await createItemV2(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.error).toBe("Authorization is header missing");
  });

  test("returns 415 for unsupported content type", async () => {
    const request = generateAuthenticatedRequest(
      "/items/v2",
      "POST",
      {
        itemName: "Chair",
        price: 100,
        quantityAvailable: 3,
        categoryName: "Furniture",
        tags: ["Modern"],
      },
      accessToken,
    );
    request.headers = {
      "content-type": "text/plain",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItemV2(request);
    const body = await response.json();

    expect(response.status).toBe(415);
    expect(body.error).toBe("UNSUPPORTED_TYPE");
    expect(body.message).toBe("This content type is not supported");
  });

  test("returns 400 when required fields are missing/invalid", async () => {
    const request = generateAuthenticatedRequest(
      "/items/v2",
      "POST",
      {
        itemName: "Chair",
        price: "100",
        quantityAvailable: -1,
        tags: [],
      },
      accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItemV2(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Bad Request");
    expect(body.message).toBe("Invalid/missing items fields");
  });

  test("creates item successfully with category and tags", async () => {
    spyOn(itemQueries, "createItemQueryV2").mockResolvedValue({
      item_id: "item_1",
      item_name: "Chair",
      category_name: "Furniture",
    } as any);

    const request = generateAuthenticatedRequest(
      "/items/v2",
      "POST",
      {
        itemName: "Chair",
        description: "Wooden chair",
        price: 100,
        quantityAvailable: 3,
        imageUrl: "https://example.com/chair.png",
        categoryName: "Furniture",
        tags: ["Modern", "Minimalist"],
      },
      accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItemV2(request);
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.message).toBe("Item created successfully");
    expect(body.item).not.toBe(undefined);
    expect(itemQueries.createItemQueryV2).toHaveBeenCalled();
  });

  test("returns 500 when create item v2 query fails", async () => {
    spyOn(itemQueries, "createItemQueryV2").mockRejectedValue(
      new Error("create v2 failed"),
    );

    const request = generateAuthenticatedRequest(
      "/items/v2",
      "POST",
      {
        itemName: "Chair",
        description: "Wooden chair",
        price: 100,
        quantityAvailable: 3,
        imageUrl: "https://example.com/chair.png",
        categoryName: "Furniture",
        tags: ["Modern"],
      },
      accessToken,
    );
    request.headers = {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    };

    const response = await createItemV2(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Creating item failed");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Getting item tests", () => {
  beforeEach(async () => {
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );

    const registerReq2 = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli8909@gmail.com",
        username: "test2",
        password: "testing123",
      },
    );

    const userRes = await register(registerReq);
    const userRes2 = await register(registerReq2);
    sellerId = (await userRes.json()).user;
    sellerId2 = (await userRes2.json()).user;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId1}, ${sellerId}, ${"test_item"}, ${9.5}, ${20})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId2}, ${sellerId2}, ${"test_item2"}, ${2.5}, ${10})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId3}, ${sellerId}, ${"test_item3"}, ${10.5}, ${25})
    `;
  });

  afterAll(async () => {
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
  });

  test("Getting item by item id", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${itemId1}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items found");
    expect(getBody.items.length).toBe(1);
    expect(getBody.items[0].item_name).toBe("test_item");
    expect(getBody.items[0].quantity_available).toBe(20);
  });

  test("Getting item that does not exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${crypto.randomUUID()}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item with invalid item UUID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items/${"kjawbdkan"}`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemsById(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(500);
    expect(getBody.message).toBe("Items fetch failed");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item by user ID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${sellerId}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items found");
    expect(getBody.items.length).toBe(2);
  });

  test("Getting non-existing item by user ID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${crypto.randomUUID()}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting item with invalid user UUID", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/users/${"alkwndakldnad"}/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getItemByUserId(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(500);
    expect(getBody.message).toBe("Getting items by user id failed");
    expect(getBody.items).toBe(undefined);
  });

  test("Getting all items that exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getAllItems(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.message).toBe("Items successfully fetched");
    expect(getBody.items.length).toBe(3);
  });

  test("Getting all items, no items exist", async () => {
    await pg`delete from items`;
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `http://localhost/items`,
      "GET",
      {},
      accessToken,
    );

    const getResponse = await getAllItems(request2);
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(404);
    expect(getBody.message).toBe("No items found");
    expect(getBody.items).toBe(undefined);
  });
});

describe("Update item tests", () => {
  beforeEach(async () => {
    // register users
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );

    const registerReq2 = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli8909@gmail.com",
        username: "test2",
        password: "testing123",
      },
    );

    const userRes = await register(registerReq);
    const userRes2 = await register(registerReq2);
    sellerId = (await userRes.json()).user;
    sellerId2 = (await userRes2.json()).user;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId1}, ${sellerId}, ${"test_item"}, ${9.5}, ${20})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId2}, ${sellerId2}, ${"test_item2"}, ${2.5}, ${10})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId3}, ${sellerId}, ${"test_item3"}, ${10.5}, ${25})
    `;
  });

  afterAll(async () => {
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
  });

  test("No items were provided", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/items/${itemId1}`,
      "PATCH",
      {
        itemId: "ajwdbakjdbadajdbjkdb",
      },
      accessToken,
    );

    const response = await updateItem(request2);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("No item fields to update provided");
  });

  test("Item get successfully updated", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/items/${itemId1}`,
      "PATCH",
      {
        itemId: itemId1,
        itemName: "new_name_2",
        description: "?XD",
        price: 100,
        quantity_available: 1000,
        image_url: "fake image url",
      },
      accessToken,
    );
    const response = await updateItem(request2);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Item successfully updated");

    const query = await pg`select * from items where item_id = ${itemId1}`;
    const item = query[0];

    expect(item.seller_id).toBe(sellerId);
    expect(item.item_name).toBe("new_name_2");
    expect(item.description).toBe("?XD");
    expect(Number(item.price)).toBe(100);
    expect(Number(item.quantity_available)).toBe(1000);
    expect(item.image_url).toBe("fake image url");
  });

  test("Item name too long fails test", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/items/${itemId1}`,
      "PATCH",
      {
        itemId: itemId1,
        itemName:
          "mocbmlmdnjxrmvkeghfamouvotvnkunpltyoiskwdeocqrrknbgvcnozkfholefrmhjamwnqdekmnunpodpcvuwqbdqpbntwanvvhglrggqdgppekoqmewfdxlqxhzjvidfbzvwpdvvvrahfvwthfdyquvfmpvcebwqjffychklevonvxivsnhjrqmynttnztumdfxhzycuxisledsejhqraysczxubzxnenocctgrlemdmusbwbvojmznhvfyyz",
      },
      accessToken,
    );

    const response = await updateItem(request2);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Update item failed");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Deleting item tests", () => {
  beforeEach(async () => {
    // register users
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;

    const registerReq = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli1234@gmail.com",
        username: "test",
        password: "testing123",
      },
    );

    const registerReq2 = generateRequest(
      "http://localhost/auth/register",
      "POST",
      {
        email: "jasonli8909@gmail.com",
        username: "test2",
        password: "testing123",
      },
    );

    const userRes = await register(registerReq);
    const userRes2 = await register(registerReq2);
    sellerId = (await userRes.json()).user;
    sellerId2 = (await userRes2.json()).user;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId1}, ${sellerId}, ${"test_item"}, ${9.5}, ${20})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId2}, ${sellerId2}, ${"test_item2"}, ${2.5}, ${10})
    `;

    await pg`
    insert into items
    (item_id, seller_id, item_name, price, quantity_available)
    values
    (${itemId3}, ${sellerId}, ${"test_item3"}, ${10.5}, ${25})
    `;
  });

  afterAll(async () => {
    // delete all registered users
    await pg`delete from items where item_id in (${itemId1}, ${itemId2}, ${itemId3})`;
    await pg`delete from refresh_tokens where user_id in (select user_id from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com'))`;
    await pg`delete from users where email in ('jasonli1234@gmail.com', 'jasonli8909@gmail.com')`;
  });

  test("Entry does not exist", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/items/${"aoiwhndaidhan"}`,
      "DELETE",
      {},
      accessToken,
    );

    const response = await deleteItem(request2);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Deleting item failed");
  });

  test("Deleting an item succedded", async () => {
    const request = generateRequest("http://localhost/auth/login", "POST", {
      email: "jasonli1234@gmail.com",
      password: "testing123",
    });
    const loginReq = await login(request);
    const accessToken = (await loginReq.json()).accessToken;

    const request2 = generateAuthenticatedRequest(
      `/items/${itemId1}`,
      "DELETE",
      {},
      accessToken,
    );

    const query2 = await pg`select * from items`;
    const response = await deleteItem(request2);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Item deleted");
    expect(body.response).not.toBe(undefined);

    const query = await pg`select * from items`;
    expect(query.length).not.toBe(query2.length);
  });
});

describe("Get all categories tests", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns 200 with category list", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllCategoriesQuery").mockResolvedValue([
      { category_id: "cat_1", category_name: "Furniture" },
      { category_id: "cat_2", category_name: "Decor" },
    ] as any);

    const request = generateAuthenticatedRequest(
      "/items/categories",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllCategories(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Categories successfully fetched");
    expect(body.categories.length).toBe(2);
  });

  test("returns 404 when no categories exist", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllCategoriesQuery").mockResolvedValue([] as any);

    const request = generateAuthenticatedRequest(
      "/items/categories",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllCategories(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("No categories found");
    expect(body.categories).toBe(undefined);
  });

  test("returns 500 on query failure path", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllCategoriesQuery").mockRejectedValue(
      new Error("categories query failed"),
    );

    const request = generateAuthenticatedRequest(
      "/items/categories",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllCategories(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Getting all categories failed");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Get all tags tests", () => {
  afterEach(() => {
    mock.restore();
  });

  test("returns 200 with tags list", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllTagsQuery").mockResolvedValue([
      { tag_id: "tag_1", tag_name: "Minimalist" },
      { tag_id: "tag_2", tag_name: "Modern" },
    ] as any);

    const request = generateAuthenticatedRequest(
      "/items/tags",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllTags(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Tags successfully fetched");
    expect(body.tags.length).toBe(2);
  });

  test("returns 404 when tags table is empty", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllTagsQuery").mockResolvedValue([] as any);

    const request = generateAuthenticatedRequest(
      "/items/tags",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllTags(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("No tags found");
    expect(body.tags).toBe(undefined);
  });

  test("returns 500 on internal failure path", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "user_123",
    } as any);
    spyOn(itemQueries, "getAllTagsQuery").mockRejectedValue(
      new Error("tags query failed"),
    );

    const request = generateAuthenticatedRequest(
      "/items/tags",
      "GET",
      {},
      "valid.fake.token",
    );
    const response = await getAllTags(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Getting all tags failed");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Add item tags tests", () => {
  let ownerAccessToken: string;
  let ownerId: string;
  let itemId: string;

  beforeEach(async () => {
    itemId = crypto.randomUUID();
    await pg`
      delete from item_tags
      where item_id in (
        select item_id from items
        where seller_id in (
          select user_id from users
          where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')
        )
      )
    `;
    await pg`
      delete from items
      where seller_id in (
        select user_id from users
        where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')
      )
    `;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')`;

    const ownerRegister = generateRequest("http://localhost/auth/register", "POST", {
      email: "itemtags-owner@gmail.com",
      username: "itemtagsowner",
      password: "testing123",
    });
    const ownerRes = await register(ownerRegister);
    ownerId = (await ownerRes.json()).user;

    const ownerLogin = generateRequest("http://localhost/auth/login", "POST", {
      email: "itemtags-owner@gmail.com",
      password: "testing123",
    });
    ownerAccessToken = (await (await login(ownerLogin)).json()).accessToken;

    const otherRegister = generateRequest("http://localhost/auth/register", "POST", {
      email: "itemtags-other@gmail.com",
      username: "itemtagsother",
      password: "testing123",
    });
    await register(otherRegister);

    const otherLogin = generateRequest("http://localhost/auth/login", "POST", {
      email: "itemtags-other@gmail.com",
      password: "testing123",
    });
    await login(otherLogin);

    await pg`
      insert into items (item_id, seller_id, item_name, price, quantity_available)
      values (${itemId}, ${ownerId}, ${"taggable_item"}, ${12.5}, ${4})
    `;
  });

  afterEach(() => {
    mock.restore();
  });

  afterAll(async () => {
    await pg`
      delete from item_tags
      where item_id in (
        select item_id from items
        where seller_id in (
          select user_id from users
          where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')
        )
      )
    `;
    await pg`
      delete from items
      where seller_id in (
        select user_id from users
        where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')
      )
    `;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('itemtags-owner@gmail.com', 'itemtags-other@gmail.com')`;
  });

  test("missing itemId/tags -> 400", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: ownerId,
    } as any);
    const request = generateAuthenticatedRequest(
      "/items/tags",
      "POST",
      {
        itemId: itemId,
      },
      "valid.fake.token",
    );

    const response = await addItemTags(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("No itemId or tags provided");
  });

  test("item not found -> 404", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: ownerId,
    } as any);
    const request = generateAuthenticatedRequest(
      "/items/tags",
      "POST",
      {
        itemId: crypto.randomUUID(),
        tags: ["Modern"],
      },
      "valid.fake.token",
    );

    const response = await addItemTags(request);
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.message).toBe("Item not found");
  });

  test("unauthorized owner -> 401", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: "not-owner-user-id",
    } as any);
    const request = generateAuthenticatedRequest(
      "/items/tags",
      "POST",
      {
        itemId: itemId,
        tags: ["Modern"],
      },
      "valid.fake.token",
    );

    const response = await addItemTags(request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.message).toBe("User does not own the item");
  });

  test("success case -> 200 and DB mapping verification", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: ownerId,
    } as any);
    const request = generateAuthenticatedRequest(
      "/items/tags",
      "POST",
      {
        itemId: itemId,
        tags: ["Modern", "Minimalist"],
      },
      "valid.fake.token",
    );

    const response = await addItemTags(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Tag added to item");

    const mapping = await pg`
      select t.tag_name
      from item_tags it
      join tags t on it.tag_id = t.tag_id
      where it.item_id = ${itemId}
      order by t.tag_name asc
    `;

    expect(mapping.length).toBe(2);
    expect(mapping[0].tag_name).toBe("minimalist");
    expect(mapping[1].tag_name).toBe("modern");
  });

  test("query failure -> 500", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: ownerId,
    } as any);
    spyOn(itemQueries, "getItemByItemIdQuery").mockRejectedValue(
      new Error("query failed"),
    );

    const request = generateAuthenticatedRequest(
      "/items/tags",
      "POST",
      {
        itemId: itemId,
        tags: ["Modern"],
      },
      "valid.fake.token",
    );

    const response = await addItemTags(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Adding item tag failed");
    expect(body.error).not.toBe(undefined);
  });
});

describe("Delete item tags tests", () => {
  let accessToken: string;
  let userId: string;
  let itemId: string;

  beforeEach(async () => {
    itemId = crypto.randomUUID();
    await pg`
      delete from item_tags
      where item_id in (
        select item_id from items
        where seller_id in (
          select user_id from users
          where email in ('deleteitemtags@gmail.com')
        )
      )
    `;
    await pg`
      delete from items
      where seller_id in (
        select user_id from users
        where email in ('deleteitemtags@gmail.com')
      )
    `;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('deleteitemtags@gmail.com')`;

    const registerReq = generateRequest("http://localhost/auth/register", "POST", {
      email: "deleteitemtags@gmail.com",
      username: "deleteitemtagsuser",
      password: "testing123",
    });
    const regRes = await register(registerReq);
    userId = (await regRes.json()).user;

    const loginReq = generateRequest("http://localhost/auth/login", "POST", {
      email: "deleteitemtags@gmail.com",
      password: "testing123",
    });
    accessToken = (await (await login(loginReq)).json()).accessToken;

    await pg`
      insert into items (item_id, seller_id, item_name, price, quantity_available)
      values (${itemId}, ${userId}, ${"delete_taggable"}, ${18.5}, ${3})
    `;
  });

  afterEach(() => {
    mock.restore();
  });

  afterAll(async () => {
    await pg`
      delete from item_tags
      where item_id in (
        select item_id from items
        where seller_id in (
          select user_id from users
          where email in ('deleteitemtags@gmail.com')
        )
      )
    `;
    await pg`
      delete from items
      where seller_id in (
        select user_id from users
        where email in ('deleteitemtags@gmail.com')
      )
    `;
    await pg`delete from refresh_tokens`;
    await pg`delete from users where email in ('deleteitemtags@gmail.com')`;
  });

  test("missing itemId or tags -> 400", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: userId,
    } as any);
    const request = generateAuthenticatedRequest(
      "/items",
      "DELETE",
      {},
      "valid.fake.token",
    );
    (request as any).query = {};

    const response = await deleteItemTags(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("No itemId or tags are not provided");
  });

  test("empty tags array -> 400", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: userId,
    } as any);
    const request = generateAuthenticatedRequest(
      `/items/${itemId}/tags`,
      "DELETE",
      {},
      "valid.fake.token",
    );
    (request as any).query = { tags: [] };

    const response = await deleteItemTags(request as any);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.message).toBe("Tags are empty");
  });

  test("comma-separated tags parsing path and deletion success -> 200", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: userId,
    } as any);
    await itemQueries.addItemTagsQuery(itemId, ["Modern", "Minimalist"]);

    const request = generateAuthenticatedRequest(
      `/items/${itemId}/tags`,
      "DELETE",
      {},
      "valid.fake.token",
    );
    (request as any).query = { tags: "modern, minimalist" };

    const response = await deleteItemTags(request as any);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.message).toBe("Tags removed from item");

    const remaining = await pg`
      select * from item_tags
      where item_id = ${itemId}
    `;
    expect(remaining.length).toBe(0);
  });

  test("failure path (500) with invalid UUID/query failure", async () => {
    spyOn(authUtils, "verifyAccessToken").mockResolvedValue({
      subject_claim: userId,
    } as any);
    spyOn(itemQueries, "deleteItemTagsQuery").mockRejectedValue(
      new Error("delete item tags failed"),
    );
    const request = generateAuthenticatedRequest(
      `/items/${itemId}/tags`,
      "DELETE",
      {},
      "valid.fake.token",
    );
    (request as any).query = { tags: "modern" };

    const response = await deleteItemTags(request as any);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.message).toBe("Removing item tags failed");
    expect(body.error).not.toBe(undefined);
  });
});
