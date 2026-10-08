'use client';

import { useRef, useState } from 'react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { ddmmyyyy, isoToDateObj, dateObjToIso, isoToWeekday } from '@/lib/format';
import { Input } from './Input';

interface DatePickerProps {
  value: string | undefined;
  onChange: (iso: string) => void;
  fromIso?: string;
  toIso?: string;
  invalid?: boolean;
  id?: string;
}

export function DatePicker({ value, onChange, fromIso, toIso, invalid, id }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const selected = value ? isoToDateObj(value) : undefined;
  const fromDate = fromIso ? isoToDateObj(fromIso) : undefined;
  const toDate = toIso ? isoToDateObj(toIso) : undefined;

  return (
    <div className="relative" ref={wrapperRef}>
      <div className="flex items-center gap-2">
        <Input
          id={id}
          readOnly
          invalid={invalid}
          value={value ? ddmmyyyy(value) : ''}
          placeholder="DD-MM-YYYY"
          onClick={() => setOpen((o) => !o)}
          onFocus={() => setOpen(true)}
        />
        {value ? <span className="whitespace-nowrap text-xs text-muted">({isoToWeekday(value)})</span> : null}
      </div>
      {open ? (
        <div className="absolute z-20 mt-1 rounded border border-border bg-white p-2 shadow-subtle">
          <DayPicker
            mode="single"
            selected={selected}
            fromDate={fromDate}
            toDate={toDate}
            onSelect={(date) => {
              if (date) {
                onChange(dateObjToIso(date));
                setOpen(false);
              }
            }}
          />
          <button
            type="button"
            className="mt-1 w-full text-center text-xs text-muted hover:text-text"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
