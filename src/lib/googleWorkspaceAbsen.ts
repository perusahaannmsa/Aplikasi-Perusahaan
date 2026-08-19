/**
 * helper file for interacting with Google Drive and Google Sheets APIs
 * using the OAuth access token obtained from the user.
 */

async function handleApiError(response: Response, actionName: string) {
  if (response.ok) return;

  const errText = await response.text();

  if (
    errText.includes("accessNotConfigured") ||
    errText.includes("has not been used in project") ||
    errText.includes("disabled")
  ) {
    throw new Error(
      `GOOGLE_DRIVE_API_DISABLED: Google Drive API atau Google Sheets API belum diaktifkan pada Google Cloud Project 158324818996.\n\n` +
      `Silakan buka URL berikut di browser Anda untuk mengaktifkan Google Drive API (cukup klik tombol 'ENABLE' sekali saja):\n` +
      `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=158324818996`
    );
  }

  if (
    response.status === 401 ||
    errText.includes("401") ||
    errText.includes("UNAUTHENTICATED") ||
    errText.includes("Invalid Credentials") ||
    errText.includes("invalid_grant")
  ) {
    throw new Error("TOKEN_EXPIRED_401: Sesi Google Drive Anda telah kedaluwarsa. Aplikasi akan memperbarui login Anda secara otomatis.");
  }

  throw new Error(`Gagal ${actionName}: ${errText}`);
}

// Helper to create a folder in Google Drive
export async function createGoogleDriveFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  const metadata: any = {
    name: folderName,
    mimeType: "application/vnd.google-apps.folder",
  };

  if (parentId) {
    metadata.parents = [parentId];
  }

  const response = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(metadata),
  });

  await handleApiError(response, "membuat folder Google Drive");

  const data = await response.json();
  return data.id; // Return Folder ID
}

// Helper to check if a folder exists, otherwise create it
export async function getOrCreateFolder(accessToken: string, folderName: string, parentId?: string): Promise<string> {
  let queryStr = `name = '${folderName.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  if (parentId) {
    queryStr += ` and '${parentId}' in parents`;
  }
  const query = encodeURIComponent(queryStr);
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&spaces=drive&fields=files(id,name)`;

  const response = await fetch(searchUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  await handleApiError(response, "mencari folder Google Drive");

  const data = await response.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id; // Return existing folder ID
  }

  return await createGoogleDriveFolder(accessToken, folderName, parentId);
}

// Helper to create nested folders sequentially
export async function getOrCreateNestedFolder(accessToken: string, folderNames: string[]): Promise<string> {
  let parentId: string | undefined = undefined;
  for (const folderName of folderNames) {
    parentId = await getOrCreateFolder(accessToken, folderName, parentId);
  }
  return parentId!;
}

// Helper to upload a file (like the generated Excel Blob) to Google Drive in a specific folder
export async function uploadFileToDrive(
  accessToken: string,
  folderId: string,
  fileName: string,
  fileBlob: Blob
): Promise<{ id: string; webViewLink: string }> {
  const metadata = {
    name: fileName,
    parents: [folderId],
  };

  const formData = new FormData();
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" })
  );
  formData.append("file", fileBlob);

  const response = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      body: formData,
    }
  );

  await handleApiError(response, "mengunggah berkas ke Google Drive");

  return await response.json();
}

// Helper to export Attendance report to a new Google Sheet
export async function exportAttendanceToGoogleSheet(
  accessToken: string,
  title: string,
  headers: string[],
  rows: any[][]
): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  // 1. Create a spreadsheet
  const createRes = await fetch("https://sheets.googleapis.com/v4/spreadsheets", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      properties: {
        title: title,
      },
    }),
  });

  await handleApiError(createRes, "membuat spreadsheet baru di Google Sheets");

  const spreadsheet = await createRes.json();
  const spreadsheetId = spreadsheet.spreadsheetId;
  const spreadsheetUrl = spreadsheet.spreadsheetUrl;

  // 2. Prepare grid values
  const values = [headers, ...rows];

  // 3. Append the grid values to Sheet1
  const updateRes = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/Sheet1!A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        values: values,
      }),
    }
  );

  await handleApiError(updateRes, "mengisi data ke Google Sheets");

  return { spreadsheetId, spreadsheetUrl };
}

