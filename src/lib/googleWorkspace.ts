import { ControlPoint, CrossSectionParams, SectionSegment } from '../types';

export interface PlanFile {
  id: string;
  name: string;
  createdTime: string;
  modifiedTime: string;
  webViewLink?: string;
  description?: string;
}

/**
 * Google Workspace (Drive & Sheets) API Client
 */
export const googleWorkspace = {
  /**
   * List files in Google Drive matching '3D-CIM' in the name
   */
  async listPlans(accessToken: string): Promise<PlanFile[]> {
    const q = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and name contains '3D-CIM' and trashed=false");
    const url = `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,createdTime,modifiedTime,webViewLink,description)&orderBy=modifiedTime+desc`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to list files from Google Drive:', errText);
      throw new Error(`Google Drive API error: ${res.statusText}`);
    }

    const data = await res.json();
    return data.files || [];
  },

  /**
   * Create a new Google Spreadsheet and fill it with road design data
   */
  async createPlanSpreadsheet(
    accessToken: string,
    name: string,
    description: string,
    controlPoints: ControlPoint[],
    crossSection: CrossSectionParams,
    sections: any[]
  ): Promise<PlanFile> {
    const spreadsheetTitle = `${name} [3D-CIM]`;

    // 1. Create Spreadsheet with required tabs
    const createUrl = 'https://sheets.googleapis.com/v4/spreadsheets';
    const createRes = await fetch(createUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: {
          title: spreadsheetTitle,
        },
        sheets: [
          { properties: { title: 'Overview' } },
          { properties: { title: 'Alignment Points' } },
          { properties: { title: 'Cross Section' } },
          { properties: { title: 'Segments' } },
        ],
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      console.error('Failed to create spreadsheet:', errText);
      throw new Error(`Google Sheets API error: ${createRes.statusText}`);
    }

    const spreadsheet = await createRes.json();
    const spreadsheetId = spreadsheet.spreadsheetId;
    const webViewLink = spreadsheet.spreadsheetUrl;

    // 2. Prepare data for sheets
    const overviewValues = [
      ['Property', 'Value', 'Description'],
      ['Plan ID', `plan-${Date.now()}`, 'Unique identification of the road alignment plan'],
      ['Name', name, 'Plan Name'],
      ['Description', description, 'Plan Description'],
      ['Created Time', new Date().toISOString(), 'Timestamp of creation'],
      ['Application', 'AlignPro CIM', 'Created by AlignPro CIM Web App'],
      ['Schema Version', '2.5', 'Data schema version'],
    ];

    const alignmentHeaders = ['Point ID', 'Point Name', 'Longitude (lng)', 'Latitude (lat)', 'X (m)', 'Y (m)', 'Z Elevation (m)', 'Radius (R)'];
    const alignmentValues = [
      alignmentHeaders,
      ...controlPoints.map(p => [
        p.id,
        p.name,
        p.lng.toString(),
        p.lat.toString(),
        p.x.toString(),
        p.y.toString(),
        p.z.toString(),
        p.r.toString(),
      ]),
    ];

    const crossSectionHeaders = ['Parameter Key', 'Value', 'Description'];
    const crossSectionValues = [
      crossSectionHeaders,
      ...Object.entries(crossSection).map(([key, val]) => [
        key,
        val !== null && val !== undefined ? val.toString() : '',
        getParameterLabel(key),
      ]),
    ];

    const segmentHeaders = ['Start Station (m)', 'End Station (m)', 'Section Type', 'Left Lane Width (m)', 'Right Lane Width (m)', 'Shoulder Width (m)', 'Girder Depth (m)', 'Pier Height (m)'];
    const segmentValues = [
      segmentHeaders,
      ...sections.map(s => [
        s.startDist.toString(),
        s.endDist.toString(),
        s.type,
        s.properties?.leftLaneWidth?.toString() || '3.25',
        s.properties?.rightLaneWidth?.toString() || '3.25',
        s.properties?.shoulderWidth?.toString() || '1.00',
        s.properties?.girderDepth?.toString() || '',
        s.properties?.pierHeight?.toString() || '',
      ]),
    ];

    // 3. Write data to spreadsheet tabs via batchUpdate
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchUpdate`;
    const updateRes = await fetch(updateUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        valueInputOption: 'USER_ENTERED',
        data: [
          { range: 'Overview!A1', values: overviewValues },
          { range: 'Alignment Points!A1', values: alignmentValues },
          { range: 'Cross Section!A1', values: crossSectionValues },
          { range: 'Segments!A1', values: segmentValues },
        ],
      }),
    });

    if (!updateRes.ok) {
      const errText = await updateRes.text();
      console.error('Failed to write spreadsheet data:', errText);
      throw new Error(`Google Sheets Write error: ${updateRes.statusText}`);
    }

    // 4. Update the Drive file description to store the custom description
    try {
      await fetch(`https://www.googleapis.com/drive/v3/files/${spreadsheetId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: description,
        }),
      });
    } catch (err) {
      console.warn('Could not save description to Drive file metadata, continuing.', err);
    }

    return {
      id: spreadsheetId,
      name: spreadsheetTitle,
      createdTime: new Date().toISOString(),
      modifiedTime: new Date().toISOString(),
      webViewLink,
      description,
    };
  },

  /**
   * Read design plan values from a Google Spreadsheet
   */
  async readPlanSpreadsheet(
    accessToken: string,
    spreadsheetId: string
  ): Promise<{ controlPoints: ControlPoint[]; crossSection: CrossSectionParams; sections: any[] }> {
    const ranges = ['Overview!A1:C20', 'Alignment Points!A1:H100', 'Cross Section!A1:C50', 'Segments!A1:H100'];
    const queryRanges = ranges.map(r => `ranges=${encodeURIComponent(r)}`).join('&');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?${queryRanges}&valueRenderOption=UNFORMATTED_VALUE`;

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to read spreadsheet:', errText);
      throw new Error(`Google Sheets Read error: ${res.statusText}`);
    }

    const data = await res.json();
    const valueRanges = data.valueRanges || [];

    const overviewRows = valueRanges[0]?.values || [];
    const alignmentRows = valueRanges[1]?.values || [];
    const crossSectionRows = valueRanges[2]?.values || [];
    const segmentRows = valueRanges[3]?.values || [];

    // Parse Alignment Points
    const controlPoints: ControlPoint[] = [];
    if (alignmentRows.length > 1) {
      // Skip header row
      for (let i = 1; i < alignmentRows.length; i++) {
        const r = alignmentRows[i];
        if (r && r[0]) {
          controlPoints.push({
            id: String(r[0]),
            name: String(r[1] || ''),
            lng: Number(r[2] || 0),
            lat: Number(r[3] || 0),
            x: Number(r[4] || 0),
            y: Number(r[5] || 0),
            z: Number(r[6] || 0),
            r: Number(r[7] || 0),
          });
        }
      }
    }

    // Default cross-sections in case parsing has some gaps
    const crossSection: CrossSectionParams = {
      leftLaneWidth: 3.25,
      rightLaneWidth: 3.25,
      shoulderWidth: 1.00,
      slopeGradient: 1.5,
      pavementThickness: 0.15,
      pavementMaterial: 'アスファルト混合物 (As)',
      baseThickness: 0.30,
      baseMaterial: '粒度調整砕石 (M-40)',
      subgradeThickness: 1.00,
      subgradeMaterial: '改良土・路床土',
      cutSlopeGradient: 1.0,
      fillSlopeGradient: 1.5,
      enableMultiStageSlope: true,
      bermInterval: 5.0,
      bermWidth: 1.0,
      enableBermDitch: true,
    };

    // Parse Cross Section
    if (crossSectionRows.length > 1) {
      for (let i = 1; i < crossSectionRows.length; i++) {
        const r = crossSectionRows[i];
        if (r && r[0] !== undefined && r[1] !== undefined) {
          const key = String(r[0]);
          const val = r[1];
          if (key in crossSection) {
            if (typeof (crossSection as any)[key] === 'number') {
              (crossSection as any)[key] = Number(val);
            } else if (typeof (crossSection as any)[key] === 'boolean') {
              (crossSection as any)[key] = val === 'true' || val === true;
            } else {
              (crossSection as any)[key] = String(val);
            }
          }
        }
      }
    }

    // Parse Segments
    const sections: any[] = [];
    if (segmentRows.length > 1) {
      for (let i = 1; i < segmentRows.length; i++) {
        const r = segmentRows[i];
        if (r && r[0] !== undefined) {
          const type = String(r[2] || 'earthwork');
          const props: any = {
            leftLaneWidth: Number(r[3] || 3.25),
            rightLaneWidth: Number(r[4] || 3.25),
            shoulderWidth: Number(r[5] || 1.00),
          };

          if (type === 'bridge' || type === 'viaduct') {
            if (r[6] !== undefined && r[6] !== '') props.girderDepth = Number(r[6]);
            if (r[7] !== undefined && r[7] !== '') props.pierHeight = Number(r[7]);
          }

          sections.push({
            startDist: Number(r[0]),
            endDist: Number(r[1]),
            type,
            properties: props,
          });
        }
      }
    }

    // Fallback if empty or failed
    return {
      controlPoints: controlPoints.length > 0 ? controlPoints : [
        { id: 'BP', name: '始点 (BP)', lng: 139.764, lat: 35.680, x: -266, y: -111, z: 32.5, r: 0 },
        { id: 'IP', name: '交点 (IP)', lng: 139.767, lat: 35.682, x: 0, y: 111, z: 45.0, r: 120 },
        { id: 'EP', name: '終点 (EP)', lng: 139.770, lat: 35.681, x: 266, y: 0, z: 38.0, r: 0 },
      ],
      crossSection,
      sections: sections.length > 0 ? sections : [
        { startDist: 0.0, endDist: 150.0, type: 'earthwork', properties: { leftLaneWidth: 3.25, rightLaneWidth: 3.25, shoulderWidth: 1.00 } }
      ],
    };
  },

  /**
   * Delete (trash) a Spreadsheet in Google Drive
   */
  async deletePlanSpreadsheet(accessToken: string, fileId: string): Promise<void> {
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}`;
    const res = await fetch(url, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        trashed: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Failed to trash file:', errText);
      throw new Error(`Google Drive Delete error: ${res.statusText}`);
    }
  },
};

/**
 * Human-readable description labels for Cross Section parameters
 */
function getParameterLabel(key: string): string {
  const labels: Record<string, string> = {
    leftLaneWidth: '左車線幅 (m)',
    rightLaneWidth: '右車線幅 (m)',
    shoulderWidth: '路肩幅 (m)',
    slopeGradient: '法面勾配 (1:N)',
    pavementThickness: '表層舗装厚 (m)',
    pavementMaterial: '舗装表層材料名',
    baseThickness: '路盤厚 (m)',
    baseMaterial: '路盤材料名',
    subgradeThickness: '路床厚 (m)',
    subgradeMaterial: '路床材料名',
    cutSlopeGradient: '切土法面勾配 (1:N)',
    fillSlopeGradient: '盛土法面勾配 (1:N)',
    enableMultiStageSlope: '多段法面自動生成フラグ',
    bermInterval: '小段設置高間隔 (m)',
    bermWidth: '小段(犬走り)幅 (m)',
    enableBermDitch: '小段排水溝自動配置フラグ',
  };
  return labels[key] || key;
}
