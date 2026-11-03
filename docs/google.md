# Google (Gmail, Drive, Sheets)

Gmail, Google Drive and Google Sheets are in the connection catalog as a **native plugin**: keyhall
calls Google's REST APIs itself, with an OAuth client that you create in your own Google Cloud
project. It works with personal `@gmail.com` accounts as well as Google Workspace ones.

Google also hosts its own MCP servers (`gmailmcp.googleapis.com` and others), but only for
Workspace accounts enrolled in the Developer Preview Program. Those servers don't support dynamic
client registration either, so keyhall can't add them as remote MCP connections.

## Tools

| Service | Tools | Scope requested |
|---|---|---|
| Gmail | `gmail_search`, `gmail_read_message`, `gmail_read_thread`, `gmail_create_draft`, `gmail_send`, `gmail_list_labels`, `gmail_modify_labels` | `gmail.modify` |
| Drive | `drive_search`, `drive_read_file`, `drive_create_file`, `drive_update_file` | `drive.readonly`, `drive.file` |
| Sheets | `sheets_get`, `sheets_read`, `sheets_write`, `sheets_append`, `sheets_clear`, `sheets_create`, `sheets_add_tab` | `spreadsheets` |

`openid` and `email` are always requested, so the panel can show which account is connected.

Drive can read every file but can only change files that keyhall itself created (`drive.file`).
`drive_read_file` exports Google Docs and Slides as text and Google Sheets as CSV. Message and file
bodies are cut at 100,000 characters.

As with any connection, a scope can limit which of these tools a token sees. For example, a bot
can search and read Gmail without being able to send.

## 1. Google Cloud project

1. Open [console.cloud.google.com](https://console.cloud.google.com) and create a project, e.g.
   `keyhall`.
2. Enable the APIs of the services you'll use. Use **APIs & Services → Library**, or run:

   ```sh
   gcloud services enable gmail.googleapis.com drive.googleapis.com sheets.googleapis.com
   ```

## 2. Consent screen

In **Google Auth Platform**:

1. **Branding**: app name (e.g. `keyhall`) and your email as the support and developer contact.
2. **Audience**: pick **External**. A personal Gmail account has no **Internal** option.
3. While the app is in **Testing**, add your Google account under **Test users**.

> **Testing apps sign you out after 7 days.** Google expires refresh tokens after 7 days for
> External apps in Testing. To keep the connection working, click **Publish app** under
> **Audience** to move the app to **In production**. You don't need to submit it for
> verification for your own use. Google will then show a "Google hasn't verified this app"
> screen when you sign in; choose **Advanced → Go to keyhall**. Unverified apps are limited
> to 100 users.

## 3. OAuth client

1. **Google Auth Platform → Clients → Create client**.
2. Application type: **Web application**.
3. **Authorized redirect URIs**: your keyhall URL followed by `/api/oauth/callback`, e.g.
   `https://keyhall.example.com/api/oauth/callback`. The new-connection form in the panel
   shows this URI with a copy button. It must match `BETTER_AUTH_URL`.
4. Create the client and copy the **client ID** and **client secret**. Save the secret right
   away: Google may not show it again.

## 4. Connections in keyhall

Gmail, Google Drive and Google Sheets are separate cards in the catalog. Each card makes a
connection with only that service's tools and scopes, so Google's consent screen asks only for
what that connection uses.

1. **Connections → New connection**, then pick **Gmail**, **Google Drive** or **Google Sheets**.
2. Under **OAuth client**:
   - the first time, choose **New client**. Give it a name in the vault (default `GOOGLE`)
     and paste the client ID and secret. keyhall saves them as the project secrets
     `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and the connection keeps only references
     to them;
   - for the next services, **Saved client** already shows `GOOGLE`. To use another Cloud
     project for some services, add it as a new client with another name, e.g.
     `GOOGLE_DATA`.

   keyhall lists a saved client when the project has both `<NAME>_CLIENT_ID` and
   `<NAME>_CLIENT_SECRET`, so a pair created on the Secrets page shows up too.
3. **Create** opens Google's sign-in. Choose the account and allow access. Back in the panel,
   the connection shows **Connected** and the account's email.

keyhall stores the tokens encrypted and refreshes the access token before it expires. If Google
revokes access, the connection turns to **Error**. This happens if you remove keyhall at
[myaccount.google.com/permissions](https://myaccount.google.com/permissions), change your
password, or the app is still in Testing after 7 days. **Connect** signs in again.

Choosing another client in **Configure** asks for a new sign-in.

## Troubleshooting

| Error | Fix |
|---|---|
| `redirect_uri_mismatch` on Google's page | The redirect URI in the OAuth client must be exactly the one the panel shows. |
| `Google API 403: … has not been used in project … or it is disabled` | Enable that API in the Cloud project (step 1). |
| `access_denied`, or "app is being tested" | Add the account as a test user, or publish the app. |
| `invalid_grant` | The refresh token was revoked or expired. Use **Connect** again. |
