import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import { Category, Exercise, HardwareConfig } from '../models';

export const espApi = createApi({
  reducerPath: 'espApi',
  baseQuery: fetchBaseQuery({ baseUrl: '/api/' }),
  tagTypes: ['Exercises', 'Settings'],
  endpoints: (builder) => ({
    getExercises: builder.query<
      { exercises: Exercise[]; categories: Category[] },
      void
    >({
      query: () => 'exercises',
      providesTags: ['Exercises'],
    }),
    addExercise: builder.mutation<void, Exercise>({
      query: (exercise) => ({
        url: 'exercises',
        method: 'POST',
        body: exercise,
        responseHandler: 'text',
      }),
      invalidatesTags: ['Exercises'],
    }),
    upsertExercise: builder.mutation<void, Exercise>({
      query: (exercise) => ({
        url: 'exercises',
        method: 'POST',
        body: exercise,
        responseHandler: 'text',
      }),
      invalidatesTags: ['Exercises'],
    }),
    deleteExercise: builder.mutation<void, string>({
      query: (name) => ({
        url: `exercises?name=${encodeURIComponent(name)}`,
        method: 'DELETE',
        responseHandler: 'text',
      }),
      invalidatesTags: ['Exercises'],
    }),
    getSettings: builder.query<HardwareConfig, void>({
      query: () => 'settings',
      providesTags: ['Settings'],
    }),
    updateSettings: builder.mutation<void, HardwareConfig>({
      query: (config) => ({
        url: 'settings',
        method: 'POST',
        body: config,
        responseHandler: 'text',
      }),
      invalidatesTags: ['Settings'],
    }),
    calibrate: builder.mutation<string, void>({
      query: () => ({
        url: 'calibrate',
        responseHandler: 'text',
      }),
    }),
    restart: builder.mutation<string, void>({
      query: () => ({
        url: 'restart',
        responseHandler: 'text',
      }),
    }),
  }),
});

export const {
  useGetExercisesQuery,
  useAddExerciseMutation,
  useUpsertExerciseMutation,
  useDeleteExerciseMutation,
  useGetSettingsQuery,
  useUpdateSettingsMutation,
  useCalibrateMutation,
  useRestartMutation,
} = espApi;
